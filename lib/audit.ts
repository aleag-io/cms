import { ActorType, AuditOutcome, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function writeAuditEntry(input: {
  requestId: string;
  actorType?: ActorType;
  actorUserId?: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: AuditOutcome;
  dioceseId?: string | null;
  parishId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditEntry.create({
    data: {
      requestId: input.requestId,
      actorType: input.actorType ?? ActorType.HUMAN,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      outcome: input.outcome,
      dioceseId: input.dioceseId,
      parishId: input.parishId,
      metadata: input.metadata,
    },
  });
}
