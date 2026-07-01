import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';

async function runGuarded(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!expected || provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const requestId = randomUUID();
  const now = new Date();
  const expired = await prisma.emergencyAccessGrant.findMany({
    where: {
      isActive: true,
      expiresAt: { lt: now },
    },
  });

  if (expired.length === 0) {
    return Response.json({ ok: true, expired: 0 });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of expired) {
      await tx.emergencyAccessGrant.update({
        where: { id: row.id },
        data: { isActive: false },
      });

      await writeAuditEntry({
        requestId,
        actorLabel: 'system:expire-emergency-access',
        action: 'sharing.emergency.expire',
        entityType: 'emergency_access_grant',
        entityId: row.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: row.dioceseId,
        parishId: row.parishId,
      });
    }
  });

  return Response.json({ ok: true, expired: expired.length });
}

export const GET = (request: Request) => handle(() => runGuarded(request));
export const POST = (request: Request) => handle(() => runGuarded(request));
