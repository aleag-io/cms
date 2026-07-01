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
  const expired = await prisma.dataSharingRequest.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
  });

  if (expired.length === 0) {
    return Response.json({ ok: true, expired: 0 });
  }

  await prisma.$transaction(async (tx) => {
    for (const req of expired) {
      await tx.dataSharingRequest.update({
        where: { id: req.id },
        data: { status: 'EXPIRED' },
      });

      await writeAuditEntry({
        requestId,
        actorLabel: 'system:expire-sharing-requests',
        action: 'sharing.request.expire',
        entityType: 'data_sharing_request',
        entityId: req.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: req.dioceseId,
        parishId: req.parishId,
      });
    }
  });

  return Response.json({ ok: true, expired: expired.length });
}

export const GET = (request: Request) => handle(() => runGuarded(request));
export const POST = (request: Request) => handle(() => runGuarded(request));
