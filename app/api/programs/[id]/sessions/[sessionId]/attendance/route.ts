import { randomUUID } from 'node:crypto';
import { AttendanceStatus, AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id: programId, sessionId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const attendance = await withTenant(claims, async (tx) => {
      const session = await tx.programSession.findFirst({
        where: { id: sessionId, programId },
        select: { id: true },
      });
      if (!session) throw new ApiError(404, 'Session not found');

      return tx.programSessionAttendance.findMany({
        where: { sessionId },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    return Response.json({ ok: true, attendance });
  });

export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: programId, sessionId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      records?: Array<{ memberId: string; status: AttendanceStatus }>;
    };
    if (!body.records?.length) {
      throw new ApiError(400, 'records array is required');
    }

    const saved = await withTenant(claims, async (tx) => {
      const session = await tx.programSession.findFirst({
        where: { id: sessionId, programId, parishId },
        select: { id: true },
      });
      if (!session) throw new ApiError(404, 'Session not found');

      const rows = [];
      for (const record of body.records!) {
        const row = await tx.programSessionAttendance.upsert({
          where: {
            sessionId_memberId: {
              sessionId,
              memberId: record.memberId,
            },
          },
          create: {
            dioceseId: actor.dioceseId,
            parishId,
            sessionId,
            memberId: record.memberId,
            status: record.status,
          },
          update: { status: record.status },
        });
        rows.push(row);
      }
      return rows;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.program_session.attendance',
      entityType: 'program_session',
      entityId: sessionId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        programId,
        sessionId,
        count: saved.length,
      },
    });

    return Response.json({ ok: true, attendance: saved });
  });
