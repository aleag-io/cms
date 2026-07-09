import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id: programId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const sessions = await withTenant(claims, (tx) =>
      tx.programSession.findMany({
        where: { programId },
        orderBy: { scheduledAt: 'desc' },
        include: {
          _count: { select: { attendance: true } },
        },
      }),
    );

    return Response.json({ ok: true, sessions });
  });

export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: programId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      title?: string;
      scheduledAt?: string;
      location?: string | null;
    };
    if (!body.title?.trim()) throw new ApiError(400, 'title is required');
    if (!body.scheduledAt) throw new ApiError(400, 'scheduledAt is required');

    const session = await withTenant(claims, async (tx) => {
      const program = await tx.program.findFirst({
        where: { id: programId, parishId },
        select: { id: true },
      });
      if (!program) throw new ApiError(404, 'Program not found');

      return tx.programSession.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          programId,
          title: body.title!.trim(),
          scheduledAt: new Date(body.scheduledAt!),
          location: body.location?.trim() || null,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.program_session.create',
      entityType: 'program_session',
      entityId: session.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { programId, title: session.title },
    });

    return Response.json({ ok: true, session });
  });
