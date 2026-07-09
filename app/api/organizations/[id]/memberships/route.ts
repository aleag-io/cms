import { randomUUID } from 'node:crypto';
import { AuditOutcome, OrgMembershipRole, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { isExclusiveMembershipViolation } from '@/lib/db/errors';

type Ctx = { params: Promise<{ id: string }> };

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (_request: Request, ctx: Ctx) =>
  handle(async () => {
    const { id: organizationId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
    ]);
    requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const memberships = await withTenant(claims, (tx) =>
      tx.organizationMembership.findMany({
        where: { organizationId, leftAt: null },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
    );

    return Response.json({ ok: true, memberships });
  });

export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: organizationId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      memberId?: string;
      role?: OrgMembershipRole;
    };
    if (!body.memberId) throw new ApiError(400, 'memberId is required');

    try {
      const membership = await withTenant(claims, async (tx) => {
        const org = await tx.organization.findFirst({
          where: { id: organizationId, parishId },
          select: { id: true, organizationType: true, membershipMode: true },
        });
        if (!org) throw new ApiError(404, 'Organization not found');

        // organizationType/membershipMode/parishId/dioceseId are overwritten by
        // the org_membership_denormalize trigger from the parent org; we still
        // pass them to satisfy the non-null columns.
        return tx.organizationMembership.create({
          data: {
            dioceseId: actor.dioceseId,
            parishId,
            organizationId,
            memberId: body.memberId!,
            role: body.role ?? OrgMembershipRole.MEMBER,
            organizationType: org.organizationType,
            membershipMode: org.membershipMode,
          },
        });
      });

      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'operations.organization_membership.create',
        entityType: 'organization_membership',
        entityId: membership.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: actor.dioceseId,
        parishId,
        metadata: { organizationId, memberId: membership.memberId },
      });

      return Response.json({ ok: true, membership });
    } catch (err) {
      if (isExclusiveMembershipViolation(err)) {
        // PA-16: surface the conflicting active membership so the UI can offer
        // an "end existing membership first" resolve action.
        const conflict = await withTenant(claims, async (tx) => {
          const org = await tx.organization.findFirst({
            where: { id: organizationId, parishId },
            select: { organizationType: true },
          });
          if (!org) return null;
          return tx.organizationMembership.findFirst({
            where: {
              memberId: body.memberId!,
              parishId,
              leftAt: null,
              membershipMode: 'EXCLUSIVE',
              organizationType: org.organizationType,
            },
            include: { organization: { select: { id: true, name: true } } },
          });
        });

        await writeAuditEntry({
          requestId,
          actorUserId: actor.id,
          actorLabel: actor.email,
          action: 'operations.organization_membership.create',
          entityType: 'organization_membership',
          entityId: null,
          outcome: AuditOutcome.DENIED,
          dioceseId: actor.dioceseId,
          parishId,
          metadata: {
            organizationId,
            memberId: body.memberId,
            reason: 'exclusive_conflict',
          },
        });

        return Response.json(
          {
            ok: false,
            error:
              'Member already belongs to an exclusive organization of this type',
            conflict: conflict
              ? {
                  membershipId: conflict.id,
                  organizationId: conflict.organization.id,
                  organizationName: conflict.organization.name,
                }
              : null,
          },
          { status: 409 },
        );
      }
      throw err;
    }
  });

/** End an active membership (leftAt). Used by exclusive-conflict "move" flow. */
export const PATCH = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id: organizationId } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.ORGANIZATION_LEADER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      membershipId?: string;
      action?: 'leave';
    };
    if (!body.membershipId) throw new ApiError(400, 'membershipId is required');
    if (body.action !== 'leave') {
      throw new ApiError(400, 'action must be "leave"');
    }

    const membership = await withTenant(claims, async (tx) => {
      const existing = await tx.organizationMembership.findFirst({
        where: {
          id: body.membershipId,
          organizationId,
          parishId,
          leftAt: null,
        },
      });
      if (!existing) throw new ApiError(404, 'Active membership not found');

      return tx.organizationMembership.update({
        where: { id: existing.id },
        data: { leftAt: new Date() },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'operations.organization_membership.leave',
      entityType: 'organization_membership',
      entityId: membership.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        organizationId,
        memberId: membership.memberId,
      },
    });

    return Response.json({ ok: true, membership });
  });
