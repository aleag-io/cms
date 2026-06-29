import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([Role.DIOCESE_ADMIN, Role.GLOBAL_ADMIN]);
    const claims = await claimsFromUser(actor);

    const parishes = await withTenant(claims, (tx) =>
      tx.parish.findMany({
        where: { dioceseId: actor.dioceseId },
        orderBy: { createdAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, parishes });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    // Parish creation is a privileged admin operation — runs with elevated
    // prisma client, not withTenant, because it creates the parish row that
    // RLS policies would otherwise need to pre-exist.
    const actor = await requireRole([Role.DIOCESE_ADMIN, Role.GLOBAL_ADMIN]);

    const body = (await request.json()) as {
      parishName?: string;
      address?: string;
      adminEmail?: string;
      adminName?: string;
      familyNumberPrefix?: string;
      familyNumberWidth?: number;
      familyNumberStart?: number;
    };

    const parishName = body.parishName?.trim();
    const adminEmail = body.adminEmail?.trim().toLowerCase();
    const adminName = body.adminName?.trim();

    if (!parishName || !adminEmail || !adminName) {
      throw new ApiError(400, 'parishName, adminEmail and adminName are required');
    }

    // Privileged path — RLS bypass intentional for provisioning.
    const created = await prisma.$transaction(async (tx) => {
      const parish = await tx.parish.create({
        data: {
          dioceseId: actor.dioceseId,
          name: parishName,
          address: body.address?.trim() || null,
          familyNumberPrefix: body.familyNumberPrefix ?? '',
          familyNumberWidth: body.familyNumberWidth ?? 4,
          familyNumberStart: body.familyNumberStart ?? 1,
        },
      });

      const admin = await tx.appUser.create({
        data: {
          email: adminEmail,
          displayName: adminName,
          role: Role.PARISH_ADMIN,
          dioceseId: actor.dioceseId,
          parishId: parish.id,
        },
      });

      return { parish, admin };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'tenant.parish.create',
      entityType: 'parish',
      entityId: created.parish.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      metadata: {
        parishName: created.parish.name,
        adminEmail: created.admin.email,
      },
    });

    return Response.json({ ok: true, parish: created.parish, admin: created.admin });
  });
