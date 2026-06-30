import { randomUUID } from 'node:crypto';
import { AuditOutcome, ProgramType, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MINISTRY_LEADER,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const programs = await withTenant(claims, (tx) =>
      tx.program.findMany({
        where: { parishId },
        orderBy: { name: 'asc' },
      }),
    );

    return Response.json({ ok: true, programs });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      programType?: ProgramType;
      coordinatorMemberId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    };

    if (!body.name?.trim()) throw new ApiError(400, 'name is required');

    const program = await withTenant(claims, (tx) =>
      tx.program.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          name: body.name!.trim(),
          description: body.description?.trim() || null,
          programType: body.programType ?? ProgramType.OTHER,
          coordinatorMemberId: body.coordinatorMemberId || null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.program.create',
      entityType: 'program',
      entityId: program.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { name: program.name, programType: program.programType },
    });

    return Response.json({ ok: true, program });
  });
