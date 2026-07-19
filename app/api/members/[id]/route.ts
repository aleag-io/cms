import { randomUUID } from 'node:crypto';
import { AuditOutcome, MemberStatus, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { emitWebhookEvent } from '@/lib/webhooks/emit';
import { ApiError, handle } from '@/lib/api';
import { projectMember } from '@/lib/projection';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.CLERGY,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const roles = claims.app_metadata.roles;
    const { id } = await context.params;

    const member = await withTenant(claims, async (tx) => {
      const existing = await tx.member.findFirst({
        where: { id, parishId },
        include: { family: true, privateNote: true, pastoralData: true },
      });
      if (!existing) throw new ApiError(404, 'Member not found');
      return existing;
    });

    return Response.json({ ok: true, member: projectMember(member, roles) });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const roles = claims.app_metadata.roles;
    const { id } = await context.params;

    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      workNotes?: string | null;
      educationLevel?:
        | 'PRIMARY'
        | 'SECONDARY'
        | 'UNDERGRADUATE'
        | 'POSTGRADUATE'
        | 'OTHER'
        | null;
      skillsInterests?: string[] | null;
      status?: MemberStatus;
    };

    // Self-service path (Phase 9): a bare member may update ONLY their own
    // row and ONLY contact fields. The member_self_update RLS policy is the
    // row-scope backstop; the field whitelist is enforced here.
    const SELF_EDITABLE_FIELDS = ['email', 'phone'];
    const isPrivileged = roles.some((role) =>
      ['global_admin', 'diocese_admin', 'parish_admin', 'parish_staff'].includes(
        role,
      ),
    );
    if (!isPrivileged) {
      const ownMemberId = claims.app_metadata.member_id;
      const disallowed = Object.keys(body).filter(
        (key) => !SELF_EDITABLE_FIELDS.includes(key),
      );
      if (id !== ownMemberId || disallowed.length > 0) {
        await writeAuditEntry({
          requestId,
          actorUserId: actor.id,
          actorLabel: actor.email,
          action: 'membership.member.update',
          entityType: 'member',
          entityId: id,
          outcome: AuditOutcome.DENIED,
          dioceseId: actor.dioceseId,
          parishId,
          metadata:
            id !== ownMemberId
              ? { reason: 'self_service_other_member' }
              : { reason: 'self_service_field_not_editable', fields: disallowed },
        });
        throw new ApiError(
          403,
          id !== ownMemberId
            ? 'Members may only update their own profile'
            : 'Members may only update their contact details (email, phone)',
        );
      }
    }

    const member = await withTenant(claims, async (tx) => {
      const existing = await tx.member.findFirst({ where: { id, parishId } });
      if (!existing) throw new ApiError(404, 'Member not found');

      const updated = await tx.member.update({
        where: { id },
        data: {
          ...(body.firstName && { firstName: body.firstName.trim() }),
          ...(body.lastName && { lastName: body.lastName.trim() }),
          ...(body.email !== undefined && {
            email: body.email?.trim() || null,
          }),
          ...(body.phone !== undefined && {
            phone: body.phone?.trim() || null,
          }),
          ...(body.workNotes !== undefined && {
            workNotes: body.workNotes?.trim() || null,
          }),
          ...(body.educationLevel !== undefined && {
            educationLevel: body.educationLevel,
          }),
          ...(body.skillsInterests !== undefined && {
            skillsInterests: (body.skillsInterests ?? [])
              .map((value) => value.trim())
              .filter(Boolean),
          }),
          ...(body.status && { status: body.status }),
        },
        include: { family: true, privateNote: true, pastoralData: true },
      });

      await emitWebhookEvent(tx, {
        dioceseId: actor.dioceseId,
        parishId,
        type: 'member.updated',
        entityId: updated.id,
        payload: {
          memberId: updated.id,
          parishId,
          memberIdentifier: updated.memberIdentifier,
          status: updated.status,
        },
      });

      return updated;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member.update',
      entityType: 'member',
      entityId: member.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: { changes: Object.keys(body) },
    });

    return Response.json({ ok: true, member: projectMember(member, roles) });
  });

// Deactivate a member (soft-delete: sets status to INACTIVE, preserves record).
// Hard deletion is not permitted — data integrity requires the record to remain.
export const DELETE = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([Role.DIOCESE_ADMIN, Role.PARISH_ADMIN]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);
    const { id } = await context.params;

    const member = await withTenant(claims, async (tx) => {
      const existing = await tx.member.findFirst({ where: { id, parishId } });
      if (!existing) throw new ApiError(404, 'Member not found');
      if (existing.status === MemberStatus.INACTIVE) {
        throw new ApiError(409, 'Member is already inactive');
      }
      return tx.member.update({
        where: { id },
        data: { status: MemberStatus.INACTIVE },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member.deactivate',
      entityType: 'member',
      entityId: member.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
    });

    return Response.json({ ok: true, member });
  });
