import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  MemberStatus,
  RegistrationStatus,
  Role,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { emitWebhookEvent } from '@/lib/webhooks/emit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Approve or reject a pending self-registration (MM-8). On approval the linked
 * PENDING member flips to ACTIVE (and becomes visible in the directory). On
 * rejection the member is marked INACTIVE. Both outcomes are audited.
 */
export const POST = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => ({}))) as {
      decision?: 'APPROVE' | 'REJECT';
    };
    const approve = (body.decision ?? 'APPROVE') === 'APPROVE';

    const registration = await withTenant(claims, async (tx) => {
      const reg = await tx.memberRegistration.findFirst({
        where: { id, parishId: actor.parishId! },
      });
      if (!reg) throw new ApiError(404, 'Registration not found');
      if (reg.approvalStatus !== RegistrationStatus.PENDING) {
        throw new ApiError(409, 'Registration already reviewed');
      }

      const updated = await tx.memberRegistration.update({
        where: { id: reg.id },
        data: {
          approvalStatus: approve
            ? RegistrationStatus.APPROVED
            : RegistrationStatus.REJECTED,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });

      if (reg.approvedMemberId) {
        await tx.member.update({
          where: { id: reg.approvedMemberId },
          data: {
            status: approve ? MemberStatus.ACTIVE : MemberStatus.INACTIVE,
          },
        });
      }

      if (approve) {
        await emitWebhookEvent(tx, {
          dioceseId: actor.dioceseId,
          parishId: actor.parishId!,
          type: 'registration.approved',
          entityId: reg.id,
          payload: {
            registrationId: reg.id,
            memberId: reg.approvedMemberId,
            parishId: actor.parishId!,
          },
        });
      }

      return updated;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: approve
        ? 'membership.registration.approve'
        : 'membership.registration.reject',
      entityType: 'member_registration',
      entityId: registration.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: { memberId: registration.approvedMemberId },
    });

    return Response.json({ ok: true, registration });
  });
