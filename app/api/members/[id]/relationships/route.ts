import { randomUUID } from 'node:crypto';
import { AuditOutcome, RelationshipType, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

// MM-13: extended family relationships between members across different family
// records within the same parish. Both members must belong to the same parish.

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.CLERGY,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const relationships = await withTenant(claims, (tx) =>
      tx.memberRelationship.findMany({
        where: { parishId, memberId },
        include: { relatedMember: true },
        orderBy: { relationshipType: 'asc' },
      }),
    );

    return Response.json({ ok: true, relationships });
  });

export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const body = (await request.json()) as {
      relatedMemberId?: string;
      relationshipType?: RelationshipType;
      notes?: string | null;
    };

    if (!body.relatedMemberId || !body.relationshipType) {
      throw new ApiError(
        400,
        'relatedMemberId and relationshipType are required',
      );
    }
    if (body.relatedMemberId === memberId) {
      throw new ApiError(400, 'A member cannot be related to themselves');
    }

    const relationship = await withTenant(claims, async (tx) => {
      // Both members must exist in the acting parish (MM-13 same-parish rule).
      const [member, related] = await Promise.all([
        tx.member.findFirst({ where: { id: memberId, parishId } }),
        tx.member.findFirst({
          where: { id: body.relatedMemberId, parishId },
        }),
      ]);
      if (!member) throw new ApiError(404, 'Member not found in parish');
      if (!related) {
        throw new ApiError(400, 'Related member not found in parish');
      }

      return tx.memberRelationship.create({
        data: {
          parishId,
          memberId,
          relatedMemberId: body.relatedMemberId!,
          relationshipType: body.relationshipType!,
          notes: body.notes?.trim() || null,
        },
        include: { relatedMember: true },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member_relationship.create',
      entityType: 'member_relationship',
      entityId: relationship.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        memberId,
        relatedMemberId: relationship.relatedMemberId,
        relationshipType: relationship.relationshipType,
      },
    });

    return Response.json({ ok: true, relationship });
  });

export const DELETE = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id: memberId } = await context.params;

    const url = new URL(request.url);
    const relationshipId = url.searchParams.get('relationshipId');
    if (!relationshipId) {
      throw new ApiError(400, 'relationshipId query parameter is required');
    }

    await withTenant(claims, async (tx) => {
      const existing = await tx.memberRelationship.findFirst({
        where: { id: relationshipId, parishId, memberId },
      });
      if (!existing) throw new ApiError(404, 'Relationship not found');
      await tx.memberRelationship.delete({ where: { id: relationshipId } });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member_relationship.delete',
      entityType: 'member_relationship',
      entityId: relationshipId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { memberId },
    });

    return Response.json({ ok: true });
  });
