import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from '@/lib/supabase/server';

const BOOTSTRAP_EMAIL = 'admin@cms.local';
const BOOTSTRAP_PASSWORD = 'Admin@Local1';

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      dioceseName?: string;
      parishName?: string;
      parishAddress?: string;
      adminEmail?: string;
      adminName?: string;
      adminPassword?: string;
    };

    // First-run only: once a diocese admin exists the system is provisioned and
    // this endpoint must never mint (or re-role) another admin — it is public
    // in the proxy, so without this guard any caller could escalate to
    // DIOCESE_ADMIN. Checked before any Supabase access so it fails closed.
    const existingAdmin = await prisma.appUser.findFirst({
      where: { role: Role.DIOCESE_ADMIN },
      select: { id: true },
    });
    if (existingAdmin) {
      await writeAuditEntry({
        requestId,
        actorType: 'SYSTEM',
        actorLabel: 'bootstrap',
        action: 'bootstrap.initialize',
        entityType: 'diocese',
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'already_provisioned' },
      });
      return Response.json(
        { ok: false, error: 'System is already provisioned' },
        { status: 409 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();

    const dioceseName = body.dioceseName?.trim() || 'Diocese of North America';
    const parishName = body.parishName?.trim() || 'St. Thomas Mar Thoma Parish';
    const parishAddress = body.parishAddress?.trim() || 'Dallas, TX';
    const adminEmail = body.adminEmail?.trim() || BOOTSTRAP_EMAIL;
    const adminName = body.adminName?.trim() || 'Diocese Admin';
    const adminPassword = body.adminPassword?.trim() || BOOTSTRAP_PASSWORD;

    // Idempotent tenant bootstrap: ensure diocese and at least one parish exist.
    let diocese = await prisma.diocese.findFirst();
    if (!diocese) {
      diocese = await prisma.diocese.create({
        data: { name: dioceseName },
      });
    }

    let parish = await prisma.parish.findFirst({
      where: { dioceseId: diocese.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!parish) {
      parish = await prisma.parish.create({
        data: {
          dioceseId: diocese.id,
          name: parishName,
          address: parishAddress,
        },
      });
    }

    // If the caller is already authenticated but lacks an AppUser row,
    // bind them to the demo tenant so the console immediately becomes usable.
    if (sessionUser) {
      await prisma.appUser.upsert({
        where: { id: sessionUser.id },
        update: {
          email: sessionUser.email ?? adminEmail,
          displayName:
            sessionUser.user_metadata?.display_name ??
            sessionUser.email ??
            adminName,
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
        create: {
          id: sessionUser.id,
          email: sessionUser.email ?? adminEmail,
          displayName:
            sessionUser.user_metadata?.display_name ??
            sessionUser.email ??
            adminName,
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
      });
    } else {
      // Fallback path for unauthenticated first-run: ensure the default admin
      // auth user exists, then always bind that auth user ID to AppUser.
      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
        });

      if (authError && !/already|exists|registered/i.test(authError.message)) {
        return Response.json(
          {
            ok: false,
            error: authError.message,
          },
          { status: 500 },
        );
      }

      let authUserId = authData?.user?.id ?? null;
      if (!authUserId) {
        const { data: usersData, error: usersError } =
          await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (usersError) {
          return Response.json(
            {
              ok: false,
              error: usersError.message,
            },
            { status: 500 },
          );
        }

        const existingAuthUser = usersData.users.find(
          (user) => user.email?.toLowerCase() === adminEmail.toLowerCase(),
        );
        authUserId = existingAuthUser?.id ?? null;
      }

      if (!authUserId) {
        return Response.json(
          {
            ok: false,
            error: 'Unable to resolve auth user for bootstrap admin',
          },
          { status: 500 },
        );
      }

      await prisma.appUser.upsert({
        where: { id: authUserId },
        update: {
          email: adminEmail,
          displayName: adminName,
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
        create: {
          id: authUserId,
          email: adminEmail,
          displayName: adminName,
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
      });
    }

    // Seed minimal visible data on first bootstrap for immediate UI feedback.
    let family = await prisma.family.findFirst({
      where: { parishId: parish.id, familyNumber: '100' },
    });
    if (!family) {
      family = await prisma.family.create({
        data: {
          dioceseId: diocese.id,
          parishId: parish.id,
          familyNumber: '100',
          familyName: 'Thomas',
          primaryContactEmail: 'family@test.local',
        },
      });
    }

    const existingMember = await prisma.member.findFirst({
      where: { parishId: parish.id, memberIdentifier: '100.1' },
      select: { id: true },
    });
    if (!existingMember) {
      await prisma.member.create({
        data: {
          dioceseId: diocese.id,
          parishId: parish.id,
          familyId: family.id,
          memberIdentifier: '100.1',
          firstName: 'Demo',
          lastName: 'Member',
          status: 'ACTIVE',
        },
      });
    }

    await writeAuditEntry({
      requestId,
      actorType: 'SYSTEM',
      actorLabel: 'bootstrap',
      action: 'bootstrap.initialize',
      entityType: 'diocese',
      entityId: diocese.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: diocese.id,
      parishId: parish.id,
      metadata: { adminEmail },
    });

    return Response.json({
      ok: true,
      message: sessionUser
        ? 'Bootstrap complete! Your current user has been linked to the demo tenant.'
        : 'Bootstrap complete! Sign in with the credentials below.',
      credentials: {
        email: adminEmail,
        password: adminPassword,
      },
    });
  } catch (error) {
    // Never let the handler throw: an uncaught error yields a non-JSON 500
    // body, which surfaces on the client as the opaque
    // "Unexpected end of JSON input". Always return structured JSON instead.
    const message =
      error instanceof Error ? error.message : 'Unexpected bootstrap failure';
    console.error(`[bootstrap ${requestId}] failed:`, error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
