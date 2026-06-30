import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  EnrollmentRole,
  EnrollmentStatus,
  Role,
} from '@prisma/client';
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

    // RLS confines a Ministry Leader to programs they coordinate; Parish
    // Admin/Staff see the whole parish. The query is identical — the DB scopes.
    const enrollments = await withTenant(claims, (tx) =>
      tx.programEnrollment.findMany({
        where: { programId },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { enrolledAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, enrollments });
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
      memberId?: string;
      role?: EnrollmentRole;
      status?: EnrollmentStatus;
    };
    if (!body.memberId) throw new ApiError(400, 'memberId is required');

    const enrollment = await withTenant(claims, async (tx) => {
      const program = await tx.program.findFirst({
        where: { id: programId, parishId },
        select: { id: true },
      });
      if (!program) throw new ApiError(404, 'Program not found');

      return tx.programEnrollment.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          programId,
          memberId: body.memberId!,
          role: body.role ?? EnrollmentRole.PARTICIPANT,
          status: body.status ?? EnrollmentStatus.ACTIVE,
        },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.program_enrollment.create',
      entityType: 'program_enrollment',
      entityId: enrollment.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { programId, memberId: enrollment.memberId, role: enrollment.role },
    });

    return Response.json({ ok: true, enrollment });
  });
