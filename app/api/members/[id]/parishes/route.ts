import { randomUUID } from 'node:crypto';
import { AuditOutcome, MembershipType, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

// MM-17: multi-parish membership. A member has exactly one primary parish and
// may hold secondary memberships. Reads are RLS-scoped (a member sees all their
// own memberships; parish staff/admin see their parish's rows).

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.CLERGY,
      Role.MEMBER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const memberships = await withTenant(claims, (tx) =>
      tx.memberParish.findMany({
        where: { memberId },
        include: { parish: true },
        orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
      }),
    );

    return Response.json({ ok: true, memberships });
  });

// Record a member's membership in the ACTING parish. Parish data sovereignty +
// RLS WITH CHECK mean a parish can only add memberships to itself — a parish
// cannot unilaterally enrol a member into another parish (that cross-parish
// enrolment is part of the Phase 4 transfer/sharing workflow). The member must
// already be visible in this parish.
export const POST = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const membership = await withTenant(claims, async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: memberId, parishId },
      });
      if (!member) throw new ApiError(404, 'Member not found in parish');

      const existing = await tx.memberParish.findFirst({
        where: { memberId, parishId },
      });
      if (existing) {
        throw new ApiError(409, 'Membership already exists in this parish');
      }

      return tx.memberParish.create({
        data: {
          memberId,
          parishId,
          isPrimary: false,
          membershipType: MembershipType.SECONDARY,
        },
        include: { parish: true },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member_parish.create',
      entityType: 'member_parish',
      entityId: membership.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { memberId },
    });

    return Response.json({ ok: true, membership });
  });

// Set the member's primary parish (MM-17). Atomic flip via the SECURITY DEFINER
// helper, since the change spans two parishes' rows.
export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const body = (await request.json()) as { primaryParishId?: string };
    if (!body.primaryParishId) {
      throw new ApiError(400, 'primaryParishId is required');
    }

    await withTenant(claims, async (tx) => {
      // The actor must be able to see a membership the member holds in the
      // actor's own parish — anchors authority to a parish the admin governs.
      const anchor = await tx.memberParish.findFirst({
        where: { memberId, parishId },
      });
      if (!anchor) {
        throw new ApiError(404, 'Member has no membership in your parish');
      }
      await tx.$executeRaw`SELECT set_member_primary_parish(${memberId}::uuid, ${body.primaryParishId}::uuid)`;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member_parish.set_primary',
      entityType: 'member_parish',
      entityId: memberId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { memberId, primaryParishId: body.primaryParishId },
    });

    return Response.json({ ok: true });
  });
