import { randomUUID } from 'node:crypto';
import { AuditOutcome, PaymentMethod, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { requireCents, requireDate, requireUuid } from '@/lib/finance/validate';
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

const PAYMENT_METHODS = new Set<PaymentMethod>([
  'CASH',
  'CHECK',
  'ACH',
  'ONLINE',
  'OTHER',
]);

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const vendorBillId = url.searchParams.get('vendorBillId');
    const payments = await withTenant(claims, (tx) =>
      tx.payment.findMany({
        where: {
          dioceseId: claims.app_metadata.diocese_id!,
          ...(vendorBillId ? { vendorBillId } : {}),
        },
        orderBy: { paidAt: 'desc' },
        take: 300,
      }),
    );
    return Response.json({
      ok: true,
      payments: payments.map((p) => ({ ...p, amountCents: centsToJson(p.amountCents) })),
    });
  });

/**
 * Record a payment against a POSTED bill: build the cash journal (DEBIT the
 * bill's AP account, CREDIT cash, cashImpact=true) as DRAFT and route through
 * maker-checker. On approval it posts and the bill is marked PAID when covered.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const vendorBillId = requireUuid('vendorBillId', body.vendorBillId);
    const amountCents = requireCents('amountCents', body.amountCents);
    const cashAccountId = requireUuid('cashAccountId', body.cashAccountId);
    const paidAt = requireDate('paidAt', body.paidAt);
    const method =
      typeof body.method === 'string' && PAYMENT_METHODS.has(body.method as PaymentMethod)
        ? (body.method as PaymentMethod)
        : 'CHECK';

    const result = await withTenant(claims, async (tx) => {
      const bill = await tx.vendorBill.findUnique({
        where: { id: vendorBillId },
        include: { journalEntry: { include: { lines: true } } },
      });
      if (!bill) throw new ApiError(404, 'Bill not found');
      if (bill.status !== 'POSTED' && bill.status !== 'PAID') {
        throw new ApiError(400, 'Bill must be approved/posted before payment');
      }
      const apLine = bill.journalEntry?.lines.find((l) => l.direction === 'CREDIT');
      if (!apLine) throw new ApiError(400, 'Bill has no accrual to pay against');

      const ledger = {
        ownerType: bill.ownerType,
        ownerId: bill.ownerId,
        dioceseId: bill.dioceseId,
        parishId: bill.parishId,
      };
      const period = await findCoveringPeriod(tx, ledger, paidAt);
      if (!period) throw new ApiError(400, 'No open period covers the payment date');

      const journal = await postJournalEntry(tx, {
        ledger,
        periodId: period.id,
        entryDate: paidAt,
        description: `Payment: ${bill.description}`,
        source: 'PAYMENT',
        cashImpact: true,
        status: 'DRAFT',
        createdByUserId: actor.id,
        lines: [
          { accountId: apLine.accountId, direction: 'DEBIT', amountCents },
          { accountId: cashAccountId, direction: 'CREDIT', amountCents },
        ],
      });

      const payment = await tx.payment.create({
        data: {
          dioceseId: bill.dioceseId,
          parishId: bill.parishId,
          ownerType: bill.ownerType,
          ownerId: bill.ownerId,
          vendorBillId,
          amountCents,
          method,
          checkNumber:
            typeof body.checkNumber === 'string' ? body.checkNumber.trim() || null : null,
          paidAt,
          journalEntryId: journal.id,
        },
      });

      const { request: approval, autoApproved } = await openApprovalRequest(tx, {
        ledger,
        entityKind: 'PAYMENT',
        entityId: payment.id,
        makerUserId: actor.id,
        amountCents,
      });
      if (autoApproved) await finalizeApprovedEntity(tx, approval, actor.id);

      return { payment, autoApproved };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: result.autoApproved ? 'finance.payment.post' : 'finance.payment.create',
      entityType: 'finance_payment',
      entityId: result.payment.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: result.payment.dioceseId,
      parishId: result.payment.parishId,
      metadata: { amountCents: centsToJson(amountCents), vendorBillId },
    });

    return Response.json(
      { ok: true, payment: { ...result.payment, amountCents: centsToJson(result.payment.amountCents) } },
      { status: 201 },
    );
  });
