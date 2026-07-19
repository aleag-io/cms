import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { emitWebhookEvent } from '@/lib/webhooks/emit';
import { ApiError, handle } from '@/lib/api';
import { requireUuid } from '@/lib/finance/validate';
import { findCoveringPeriod, postJournalEntry } from '@/lib/finance/posting';
import { batchTotalCents, groupCreditsByAccount } from '@/lib/finance/batch';
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
 * Post a batch as ONE consolidated deposit: debit the deposit (cash) account for
 * the batch total, credit each category's income account by subtotal. The single
 * debit equals one bank-statement deposit line for reconciliation.
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
    const depositAccountId = requireUuid('depositAccountId', body.depositAccountId);

    const result = await withTenant(claims, async (tx) => {
      const batch = await tx.donationBatch.findUnique({
        where: { id },
        include: { donations: { where: { status: 'ACTIVE' }, include: { category: true } } },
      });
      if (!batch) throw new ApiError(404, 'Batch not found');
      if (batch.status !== 'OPEN') throw new ApiError(400, 'Batch is not open');
      if (batch.donations.length === 0) throw new ApiError(400, 'Batch has no gifts');
      if (batch.donations.some((d) => !d.category)) {
        throw new ApiError(400, 'Assign a category to every gift before posting');
      }

      const ledger = {
        ownerType: batch.ownerType,
        ownerId: batch.ownerId,
        dioceseId: batch.dioceseId,
        parishId: batch.parishId,
      };
      const depositAccount = await tx.account.findUnique({ where: { id: depositAccountId } });
      if (!depositAccount || depositAccount.ownerType !== batch.ownerType || depositAccount.ownerId !== batch.ownerId) {
        throw new ApiError(400, 'deposit account is not on this ledger');
      }

      const total = batchTotalCents(batch.donations);
      const credits = groupCreditsByAccount(
        batch.donations.map((d) => ({ incomeAccountId: d.category!.incomeAccountId, amountCents: d.amountCents })),
      );
      const period = await findCoveringPeriod(tx, ledger, batch.batchDate);
      if (!period) throw new ApiError(400, 'No open accounting period covers the batch date');

      const entry = await postJournalEntry(tx, {
        ledger,
        periodId: period.id,
        entryDate: batch.batchDate,
        description: `Deposit: ${batch.label}`,
        reference: batch.depositReference,
        source: 'DONATION',
        cashImpact: true,
        status: 'POSTED',
        createdByUserId: actor.id,
        lines: [
          { accountId: depositAccountId, direction: 'DEBIT', amountCents: total },
          ...credits.map((c) => ({ accountId: c.accountId, direction: 'CREDIT' as const, amountCents: c.amountCents })),
        ],
      });

      const updated = await tx.donationBatch.update({
        where: { id },
        data: {
          status: 'POSTED',
          depositAccountId,
          postedJournalEntryId: entry.id,
          totalCents: total,
          donationCount: batch.donations.length,
        },
      });
      await tx.donation.updateMany({ where: { batchId: id }, data: { journalEntryId: entry.id } });

      if (updated.parishId) {
        await emitWebhookEvent(tx, {
          dioceseId: updated.dioceseId,
          parishId: updated.parishId,
          type: 'donation_batch.posted',
          entityId: updated.id,
          payload: {
            batchId: updated.id,
            parishId: updated.parishId,
            totalCents: total.toString(),
            donationCount: batch.donations.length,
            batchDate: updated.batchDate.toISOString().slice(0, 10),
          },
        });
      }

      return { batch: updated, journalEntryId: entry.id, total, count: batch.donations.length };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.donationbatch.post',
      entityType: 'finance_donation_batch',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: result.batch.dioceseId,
      parishId: result.batch.parishId,
      metadata: {
        journalEntryId: result.journalEntryId,
        totalCents: centsToJson(result.total),
        donationCount: result.count,
      },
    });

    return Response.json({
      ok: true,
      batch: { ...result.batch, totalCents: centsToJson(result.batch.totalCents) },
      journalEntryId: result.journalEntryId,
    });
  });
