import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';

export async function POST() {
  const requestId = randomUUID();

  const existingDiocese = await prisma.diocese.findFirst({
    include: { parishes: true, users: true },
  });

  if (existingDiocese) {
    return Response.json({
      ok: true,
      message: 'Bootstrap already completed',
      diocese: existingDiocese,
    });
  }

  const diocese = await prisma.diocese.create({
    data: {
      name: 'Diocese of North America',
    },
  });

  const parish = await prisma.parish.create({
    data: {
      dioceseId: diocese.id,
      name: 'St. Thomas Mar Thoma Parish',
      address: 'Dallas, TX',
    },
  });

  const admin = await prisma.appUser.create({
    data: {
      email: 'admin@cms.local',
      displayName: 'Diocese Admin',
      role: Role.DIOCESE_ADMIN,
      dioceseId: diocese.id,
      parishId: parish.id,
    },
  });

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
    metadata: {
      adminEmail: admin.email,
      parishName: parish.name,
    },
  });

  return Response.json({
    ok: true,
    message: 'Bootstrap complete',
    credentials: {
      email: admin.email,
    },
  });
}
