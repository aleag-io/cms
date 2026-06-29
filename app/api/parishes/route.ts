import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';

export async function GET() {
  const user = await requireRole([Role.DIOCESE_ADMIN, Role.GLOBAL_ADMIN]);

  const parishes = await prisma.parish.findMany({
    where: { dioceseId: user.dioceseId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json({ ok: true, parishes });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const actor = await requireRole([Role.DIOCESE_ADMIN, Role.GLOBAL_ADMIN]);
  const body = (await request.json()) as {
    parishName?: string;
    address?: string;
    adminEmail?: string;
    adminName?: string;
  };

  const parishName = body.parishName?.trim();
  const adminEmail = body.adminEmail?.trim().toLowerCase();
  const adminName = body.adminName?.trim();

  if (!parishName || !adminEmail || !adminName) {
    return Response.json(
      { ok: false, error: 'parishName, adminEmail and adminName are required' },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const parish = await tx.parish.create({
      data: {
        dioceseId: actor.dioceseId,
        name: parishName,
        address: body.address?.trim() || null,
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

  return Response.json({
    ok: true,
    parish: created.parish,
    admin: created.admin,
  });
}
