import { randomUUID } from 'node:crypto';
import { AuditOutcome, OfficerType, Role } from '@prisma/client';
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
      Role.CLERGY,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const officers = await withTenant(claims, (tx) =>
      tx.parishOfficer.findMany({
        where: { parishId },
        include: { member: true },
        orderBy: [{ officerType: 'asc' }, { title: 'asc' }],
      }),
    );

    return Response.json({ ok: true, officers });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      memberId?: string;
      title?: string;
      officerType?: OfficerType;
      termStart?: string;
      termEnd?: string | null;
      isActive?: boolean;
      notes?: string | null;
    };

    if (!body.memberId || !body.title || !body.officerType) {
      throw new ApiError(400, 'memberId, title, and officerType are required');
    }

    const member = await withTenant(claims, (tx) =>
      tx.member.findFirst({ where: { id: body.memberId, parishId } }),
    );
    if (!member) throw new ApiError(400, 'Member not found in parish');

    const officer = await withTenant(claims, (tx) =>
      tx.parishOfficer.create({
        data: {
          parishId,
          memberId: body.memberId!,
          title: body.title!.trim(),
          officerType: body.officerType!,
          termStart: body.termStart ? new Date(body.termStart) : new Date(),
          termEnd: body.termEnd ? new Date(body.termEnd) : null,
          isActive: body.isActive ?? true,
          notes: body.notes?.trim() || null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.parish_officer.create',
      entityType: 'parish_officer',
      entityId: officer.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        memberId: officer.memberId,
        officerType: officer.officerType,
      },
    });

    return Response.json({ ok: true, officer });
  });
