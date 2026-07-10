import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role, type LiturgicalObservance } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseLiturgicalPatch } from '@/lib/liturgical/validate';

const PARISH_WRITERS: Role[] = [
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.GLOBAL_ADMIN,
];
const DIOCESE_WRITERS: Role[] = [
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.GLOBAL_ADMIN,
];

/** Parish actors may only mutate parish-local rows in their parish;
 *  diocese-wide rows are writable by diocese roles only. */
function assertCanMutate(
  existing: Pick<LiturgicalObservance, 'parishId'>,
  actor: { role: Role; parishId: string | null },
): void {
  if (existing.parishId) {
    if (existing.parishId !== actor.parishId) {
      throw new ApiError(403, 'Forbidden');
    }
    if (!PARISH_WRITERS.includes(actor.role)) {
      throw new ApiError(403, 'Forbidden');
    }
  } else if (!DIOCESE_WRITERS.includes(actor.role)) {
    throw new ApiError(403, 'Forbidden');
  }
}

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await context.params;
    const patch = parseLiturgicalPatch(
      (await request.json()) as Record<string, unknown>,
    );

    const actor = await requireRole([...DIOCESE_WRITERS, ...PARISH_WRITERS]);
    const claims = await claimsFromUser(actor);

    const updated = await withTenant(claims, async (tx) => {
      const existing = await tx.liturgicalObservance.findFirst({
        where: { id },
      });
      if (!existing) throw new ApiError(404, 'Observance not found');
      assertCanMutate(existing, actor);

      return tx.liturgicalObservance.update({
        where: { id },
        data: patch,
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'liturgical.observance.update',
      entityType: 'liturgical_observance',
      entityId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: updated.parishId,
    });

    return Response.json({ ok: true, observance: updated });
  });

export const DELETE = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await context.params;
    const actor = await requireRole([...DIOCESE_WRITERS, ...PARISH_WRITERS]);
    const claims = await claimsFromUser(actor);

    const deleted = await withTenant(claims, async (tx) => {
      const existing = await tx.liturgicalObservance.findFirst({
        where: { id },
      });
      if (!existing) throw new ApiError(404, 'Observance not found');
      assertCanMutate(existing, actor);

      await tx.liturgicalObservance.delete({ where: { id } });
      return existing;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'liturgical.observance.delete',
      entityType: 'liturgical_observance',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: deleted.parishId,
    });

    return Response.json({ ok: true });
  });
