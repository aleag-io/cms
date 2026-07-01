import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  GranteeType,
  Role,
  SharingRequestStatus,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
    ]);
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => ({}))) as {
      decision?: 'APPROVE' | 'REJECT';
      expiresAt?: string | null;
      notes?: string | null;
    };
    const decision = body.decision ?? 'APPROVE';
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new ApiError(400, 'decision must be APPROVE or REJECT');
    }

    const result = await withTenant(claims, async (tx) => {
      const existing = await tx.dataSharingRequest.findFirst({
        where: { id, parishId: actor.parishId! },
      });
      if (!existing) throw new ApiError(404, 'Sharing request not found');
      if (existing.status !== SharingRequestStatus.PENDING) {
        throw new ApiError(409, 'Sharing request already reviewed');
      }

      const updated = await tx.dataSharingRequest.update({
        where: { id: existing.id },
        data: {
          status:
            decision === 'APPROVE'
              ? SharingRequestStatus.APPROVED
              : SharingRequestStatus.REJECTED,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });

      let grantId: string | null = null;
      if (decision === 'APPROVE') {
        const grant = await tx.dataSharingGrant.create({
          data: {
            parishId: updated.parishId,
            dioceseId: updated.dioceseId,
            dataCategory: updated.dataCategory,
            granteeType: GranteeType.DIOCESE,
            granteeId: updated.dioceseId,
            grantedByUserId: actor.id,
            requestId: updated.id,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            notes: body.notes?.trim() || null,
          },
        });
        grantId = grant.id;
      }

      return { updated, grantId };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action:
        decision === 'APPROVE'
          ? 'sharing.request.approve'
          : 'sharing.request.reject',
      entityType: 'data_sharing_request',
      entityId: result.updated.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: { decision },
    });

    if (result.grantId) {
      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'sharing.grant.create',
        entityType: 'data_sharing_grant',
        entityId: result.grantId,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
        metadata: { requestId: result.updated.id },
      });
    }

    return Response.json({ ok: true, request: result.updated });
  });
