/**
 * Maker-checker approval flow wired into the posting lifecycle (PA-23/24).
 *
 * A maker who submits a journal/bill/payment opens an ApprovalRequest. The
 * configured ApprovalPolicy (via resolveApproval) decides whether it
 * auto-approves (post immediately) or must be approved by an eligible,
 * non-maker approver first. The DB trigger `assert_journal_approved` is the
 * backstop: a MANUAL journal cannot reach POSTED without an
 * APPROVED/AUTO_APPROVED request.
 */

import type {
  ApprovalEntityKind,
  ApprovalRequest,
  Prisma,
} from '@prisma/client';
import type { LedgerRef } from '@/lib/finance/ledger-scope';
import { resolveApproval } from '@/lib/finance/approval';

type Tx = Prisma.TransactionClient;

export async function getActivePolicy(
  tx: Tx,
  ledger: Pick<LedgerRef, 'ownerType' | 'ownerId'>,
  entityKind: ApprovalEntityKind,
) {
  return tx.approvalPolicy.findFirst({
    where: {
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      entityKind,
      isActive: true,
    },
  });
}

export type OpenApprovalArgs = {
  ledger: LedgerRef;
  entityKind: ApprovalEntityKind;
  entityId: string;
  makerUserId: string;
  amountCents: bigint;
};

/**
 * Open an approval request and decide whether it auto-approves. When no policy
 * is configured for the owner+entityKind, defaults to auto-approve so the
 * ledger is usable out of the box; admins tighten governance by creating an
 * ApprovalPolicy.
 */
export async function openApprovalRequest(
  tx: Tx,
  args: OpenApprovalArgs,
): Promise<{ request: ApprovalRequest; autoApproved: boolean }> {
  const policy = await getActivePolicy(tx, args.ledger, args.entityKind);
  let requiresApproval = false;
  let requiredApprovals = 1;
  if (policy) {
    const res = resolveApproval(
      {
        mode: policy.mode,
        thresholdCents: policy.thresholdCents,
        minApprovals: policy.minApprovals,
        sensitiveKinds: policy.sensitiveKinds,
      },
      args.amountCents,
      args.entityKind,
    );
    requiresApproval = res.requiresApproval;
    requiredApprovals = res.requiredApprovals || 1;
  }
  const autoApproved = !requiresApproval;

  const request = await tx.approvalRequest.create({
    data: {
      dioceseId: args.ledger.dioceseId,
      parishId: args.ledger.parishId,
      ownerType: args.ledger.ownerType,
      ownerId: args.ledger.ownerId,
      entityKind: args.entityKind,
      entityId: args.entityId,
      makerUserId: args.makerUserId,
      amountCents: args.amountCents,
      status: autoApproved ? 'AUTO_APPROVED' : 'PENDING',
      requiredApprovals: autoApproved ? 0 : requiredApprovals,
    },
  });
  return { request, autoApproved };
}

/**
 * Post the underlying entity once its ApprovalRequest is APPROVED/AUTO_APPROVED.
 * JOURNAL posts here; VENDOR_BILL/PAYMENT delegate to their own finalizers
 * (registered below) so this module stays free of AP-specific logic.
 */
export type EntityFinalizer = (
  tx: Tx,
  request: ApprovalRequest,
  actorUserId: string,
) => Promise<void>;

async function postLinkedJournal(
  tx: Tx,
  journalEntryId: string | null,
  actorUserId: string,
) {
  if (!journalEntryId) return;
  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: { status: 'POSTED', postedAt: new Date(), postedByUserId: actorUserId },
  });
}

const finalizers: Partial<Record<ApprovalEntityKind, EntityFinalizer>> = {
  JOURNAL: async (tx, request, actorUserId) => {
    await postLinkedJournal(tx, request.entityId, actorUserId);
  },
  VENDOR_BILL: async (tx, request, actorUserId) => {
    const bill = await tx.vendorBill.findUnique({ where: { id: request.entityId } });
    if (!bill) return;
    await postLinkedJournal(tx, bill.journalEntryId, actorUserId);
    await tx.vendorBill.update({ where: { id: bill.id }, data: { status: 'POSTED' } });
  },
  PAYMENT: async (tx, request, actorUserId) => {
    const payment = await tx.payment.findUnique({
      where: { id: request.entityId },
      include: { vendorBill: true },
    });
    if (!payment) return;
    await postLinkedJournal(tx, payment.journalEntryId, actorUserId);
    // Mark the bill PAID once posted payments cover its amount.
    const paid = await tx.payment.aggregate({
      where: { vendorBillId: payment.vendorBillId, journalEntry: { status: 'POSTED' } },
      _sum: { amountCents: true },
    });
    if ((paid._sum.amountCents ?? BigInt(0)) >= payment.vendorBill.amountCents) {
      await tx.vendorBill.update({ where: { id: payment.vendorBillId }, data: { status: 'PAID' } });
    }
  },
};

export function registerEntityFinalizer(
  kind: ApprovalEntityKind,
  fn: EntityFinalizer,
): void {
  finalizers[kind] = fn;
}

export async function finalizeApprovedEntity(
  tx: Tx,
  request: ApprovalRequest,
  actorUserId: string,
): Promise<void> {
  const fn = finalizers[request.entityKind];
  if (fn) await fn(tx, request, actorUserId);
}
