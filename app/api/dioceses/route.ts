import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const GET = () =>
  handle(async () => {
    await requireRole([Role.GLOBAL_ADMIN]);
    const dioceses = await prisma.diocese.findMany({ orderBy: { name: 'asc' } });
    return Response.json({ ok: true, dioceses });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.GLOBAL_ADMIN]);

    const body = (await request.json()) as {
      name?: string;
      adminEmail?: string;
      adminName?: string;
    };

    const name = body.name?.trim();
    const adminEmail = body.adminEmail?.trim().toLowerCase();
    const adminName = body.adminName?.trim();

    if (!name || !adminEmail || !adminName) {
      throw new ApiError(400, 'name, adminEmail and adminName are required');
    }

    // Diocese provisioning is always privileged — no RLS scope applies.
    const created = await prisma.$transaction(async (tx) => {
      const diocese = await tx.diocese.create({ data: { name } });
      const admin = await tx.appUser.create({
        data: {
          email: adminEmail,
          displayName: adminName,
          role: Role.DIOCESE_ADMIN,
          dioceseId: diocese.id,
          parishId: null,
        },
      });
      return { diocese, admin };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'tenant.diocese.create',
      entityType: 'diocese',
      entityId: created.diocese.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: created.diocese.id,
      metadata: { name: created.diocese.name, adminEmail: created.admin.email },
    });

    return Response.json({ ok: true, diocese: created.diocese, admin: created.admin });
  });
