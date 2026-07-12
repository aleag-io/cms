import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { finalizeApprovedEntity } from '@/lib/finance/approval-flow';

const APPROVER_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const POST = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...APPROVER_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const decision = body.decision;
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new ApiError(400, 'decision must be APPROVE or REJECT');
    }

    const result = await withTenant(claims, async (tx) => {
      const req = await tx.approvalRequest.findUnique({
        where: { id },
        include: { decisions: true },
      });
      if (!req) throw new ApiError(404, 'Approval request not found');
      if (req.status !== 'PENDING') {
        throw new ApiError(400, 'Request is already terminal');
      }
      if (req.makerUserId === actor.id) {
        throw new ApiError(403, 'Cannot self-approve');
      }

      const note =
        typeof body.note === 'string' ? body.note.trim() || null : null;

      await tx.approvalDecision.create({
        data: {
          approvalRequestId: id,
          approverUserId: actor.id,
          decision,
          note,
        },
      });

      if (decision === 'REJECT') {
        return tx.approvalRequest.update({
          where: { id },
          data: { status: 'REJECTED' },
        });
      }

      const approveCount =
        req.decisions.filter((d) => d.decision === 'APPROVE').length + 1;
      if (approveCount >= req.requiredApprovals) {
        const approved = await tx.approvalRequest.update({
          where: { id },
          data: { status: 'APPROVED' },
        });
        // Post/finalize the underlying entity (journal → POSTED, bill/payment
        // → post their journal) now that approval is complete.
        await finalizeApprovedEntity(tx, approved, actor.id);
        return approved;
      }
      return req;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.approval.decide',
      entityType: 'finance_approval_request',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: result.dioceseId,
      parishId: result.parishId,
      metadata: { decision, status: result.status },
    });

    return Response.json({
      ok: true,
      request: { ...result, amountCents: result.amountCents.toString() },
    });
  });
