import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

const BOOTSTRAP_EMAIL = 'admin@cms.local';
const BOOTSTRAP_PASSWORD = 'Admin@Local1';

export async function POST() {
  const requestId = randomUUID();

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();

    // Idempotent tenant bootstrap: ensure diocese and at least one parish exist.
    let diocese = await prisma.diocese.findFirst();
    if (!diocese) {
      diocese = await prisma.diocese.create({
        data: { name: 'Diocese of North America' },
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
          name: 'St. Thomas Mar Thoma Parish',
          address: 'Dallas, TX',
        },
      });
    }

    // If the caller is already authenticated but lacks an AppUser row,
    // bind them to the demo tenant so the console immediately becomes usable.
    if (sessionUser) {
      await prisma.appUser.upsert({
        where: { id: sessionUser.id },
        update: {
          email: sessionUser.email ?? BOOTSTRAP_EMAIL,
          displayName:
            sessionUser.user_metadata?.display_name ??
            sessionUser.email ??
            'Demo Admin',
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
        create: {
          id: sessionUser.id,
          email: sessionUser.email ?? BOOTSTRAP_EMAIL,
          displayName:
            sessionUser.user_metadata?.display_name ??
            sessionUser.email ??
            'Demo Admin',
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: parish.id,
          isActive: true,
        },
      });
    } else {
      // Fallback path for unauthenticated first-run: ensure the default admin user exists.
      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email: BOOTSTRAP_EMAIL,
          password: BOOTSTRAP_PASSWORD,
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

      if (authData?.user) {
        await prisma.appUser.upsert({
          where: { id: authData.user.id },
          update: {
            email: BOOTSTRAP_EMAIL,
            displayName: 'Diocese Admin',
            role: Role.DIOCESE_ADMIN,
            dioceseId: diocese.id,
            parishId: parish.id,
            isActive: true,
          },
          create: {
            id: authData.user.id,
            email: BOOTSTRAP_EMAIL,
            displayName: 'Diocese Admin',
            role: Role.DIOCESE_ADMIN,
            dioceseId: diocese.id,
            parishId: parish.id,
            isActive: true,
          },
        });
      }
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
      metadata: { adminEmail: BOOTSTRAP_EMAIL },
    });

    return Response.json({
      ok: true,
      message: sessionUser
        ? 'Bootstrap complete! Your current user has been linked to the demo tenant.'
        : 'Bootstrap complete! Sign in with the credentials below.',
      credentials: {
        email: BOOTSTRAP_EMAIL,
        password: BOOTSTRAP_PASSWORD,
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
