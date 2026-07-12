import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { requireUuid } from '@/lib/finance/validate';
import { findCoveringPeriod, postJournalEntry } from '@/lib/finance/posting';
import {
  finalizeApprovedEntity,
  openApprovalRequest,
} from '@/lib/finance/approval-flow';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

/**
 * Submit a DRAFT bill: build the accrual journal (DEBIT expense, CREDIT AP,
 * cashImpact=false) as a DRAFT, link it, and route through maker-checker. When
 * auto-approved the accrual posts immediately; otherwise it holds until an
 * approver decides (finalizeApprovedEntity posts it).
 */
export const POST = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const expenseAccountId = requireUuid('expenseAccountId', body.expenseAccountId);
    const apAccountId = requireUuid('apAccountId', body.apAccountId);

    const result = await withTenant(claims, async (tx) => {
      const bill = await tx.vendorBill.findUnique({ where: { id } });
      if (!bill) throw new ApiError(404, 'Bill not found');
      if (bill.status !== 'DRAFT') {
        throw new ApiError(400, 'Only DRAFT bills can be submitted');
      }
      const ledger = {
        ownerType: bill.ownerType,
        ownerId: bill.ownerId,
        dioceseId: bill.dioceseId,
        parishId: bill.parishId,
      };
      const period = await findCoveringPeriod(tx, ledger, bill.billDate);
      if (!period) throw new ApiError(400, 'No open period covers the bill date');

      const journal = await postJournalEntry(tx, {
        ledger,
        periodId: period.id,
        entryDate: bill.billDate,
        description: `Vendor bill: ${bill.description}`,
        source: 'VENDOR_BILL',
        cashImpact: false,
        status: 'DRAFT',
        createdByUserId: actor.id,
        lines: [
          { accountId: expenseAccountId, direction: 'DEBIT', amountCents: bill.amountCents },
          { accountId: apAccountId, direction: 'CREDIT', amountCents: bill.amountCents },
        ],
      });

      await tx.vendorBill.update({
        where: { id },
        data: { journalEntryId: journal.id, status: 'SUBMITTED' },
      });

      const { request: approval, autoApproved } = await openApprovalRequest(tx, {
        ledger,
        entityKind: 'VENDOR_BILL',
        entityId: bill.id,
        makerUserId: actor.id,
        amountCents: bill.amountCents,
      });
      if (autoApproved) await finalizeApprovedEntity(tx, approval, actor.id);

      const updated = await tx.vendorBill.findUniqueOrThrow({ where: { id } });
      return { bill: updated, autoApproved };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: result.autoApproved
        ? 'finance.vendorbill.post'
        : 'finance.vendorbill.submit',
      entityType: 'finance_vendor_bill',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: result.bill.dioceseId,
      parishId: result.bill.parishId,
      metadata: { status: result.bill.status },
    });

    return Response.json({
      ok: true,
      bill: { ...result.bill, amountCents: centsToJson(result.bill.amountCents) },
    });
  });
