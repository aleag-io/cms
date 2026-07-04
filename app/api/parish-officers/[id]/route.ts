import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id } = await context.params;

    const body = (await request.json()) as {
      title?: string;
      isActive?: boolean;
      termEnd?: string | null;
    };

    const officer = await withTenant(claims, async (tx) => {
      const existing = await tx.parishOfficer.findFirst({
        where: { id, parishId },
      });
      if (!existing) throw new ApiError(404, 'Officer not found');

      return tx.parishOfficer.update({
        where: { id },
        data: {
          ...(body.title && { title: body.title.trim() }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.termEnd !== undefined && {
            termEnd: body.termEnd ? new Date(body.termEnd) : null,
          }),
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.parish_officer.update',
      entityType: 'parish_officer',
      entityId: officer.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { changes: Object.keys(body) },
    });

    return Response.json({ ok: true, officer });
  });
