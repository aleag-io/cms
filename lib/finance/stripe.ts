/**
 * Stripe donation ingestion (PA-9, IN-6). Idempotent on the Stripe event id:
 * the same event delivered twice yields exactly one Donation + one balanced
 * journal entry. Runs with the privileged client (pre-auth), tenant fields from
 * event metadata set at Checkout creation.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { findCoveringPeriod, postJournalEntry } from '@/lib/finance/posting';

export type StripeEventInput = {
  id: string;
  type: string;
  amountCents: bigint;
  receivedAt?: Date;
  metadata: Record<string, string | undefined>;
};

const DONATION_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'payment_intent.succeeded',
  'charge.succeeded',
]);

export type IngestResult = {
  created: boolean;
  duplicate: boolean;
  donationId?: string;
};

/** Idempotently ingest a verified Stripe event into a donation + journal. */
export async function ingestStripeEvent(
  prisma: PrismaClient,
  event: StripeEventInput,
): Promise<IngestResult> {
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing) {
    return { created: false, duplicate: true, donationId: existing.donationId ?? undefined };
  }
  if (!DONATION_EVENT_TYPES.has(event.type)) {
    // Acknowledge non-donation events without creating ledger rows.
    await prisma.stripeEvent
      .create({ data: { id: event.id, type: event.type, processedAt: new Date() } })
      .catch(() => undefined);
    return { created: false, duplicate: false };
  }

  const dioceseId = event.metadata.dioceseId;
  const parishId = event.metadata.parishId ?? null;
  if (!dioceseId) throw new Error('Stripe event metadata missing dioceseId');
  const receivedAt = event.receivedAt ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const ledger = parishId
        ? { ownerType: 'PARISH' as const, ownerId: parishId, dioceseId, parishId }
        : { ownerType: 'DIOCESE' as const, ownerId: dioceseId, dioceseId, parishId: null };

      // Resolve cash + income accounts from metadata or by chart convention.
      const cashAccount = event.metadata.cashAccountId
        ? await tx.account.findUnique({ where: { id: event.metadata.cashAccountId } })
        : await tx.account.findFirst({
            where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId, type: 'ASSET', isActive: true },
            orderBy: { code: 'asc' },
          });
      const incomeAccount = event.metadata.incomeAccountId
        ? await tx.account.findUnique({ where: { id: event.metadata.incomeAccountId } })
        : await tx.account.findFirst({
            where: {
              ownerType: ledger.ownerType,
              ownerId: ledger.ownerId,
              type: 'INCOME',
              isActive: true,
              ...(event.metadata.fundId ? { fundId: event.metadata.fundId } : {}),
            },
            orderBy: { code: 'asc' },
          });
      if (!cashAccount || !incomeAccount) {
        throw new Error('Stripe ingest: could not resolve cash/income accounts');
      }

      const period = await findCoveringPeriod(tx, ledger, receivedAt);
      if (!period) throw new Error('Stripe ingest: no open period covers the gift date');

      const journal = await postJournalEntry(tx, {
        ledger,
        periodId: period.id,
        entryDate: receivedAt,
        description: 'Online donation (Stripe)',
        source: 'STRIPE',
        cashImpact: true,
        status: 'POSTED',
        createdByUserId: event.metadata.createdByUserId ?? (await systemUserId(tx, dioceseId)),
        lines: [
          { accountId: cashAccount.id, direction: 'DEBIT', amountCents: event.amountCents },
          { accountId: incomeAccount.id, direction: 'CREDIT', amountCents: event.amountCents },
        ],
      });

      const donation = await tx.donation.create({
        data: {
          dioceseId,
          parishId,
          familyId: event.metadata.familyId ?? null,
          memberId: event.metadata.memberId ?? null,
          fundId: event.metadata.fundId ?? cashAccount.fundId ?? null,
          campaignId: event.metadata.campaignId ?? null,
          periodId: period.id,
          amountCents: event.amountCents,
          method: 'CARD',
          externalTxnId: event.metadata.externalTxnId ?? event.id,
          receivedAt,
          journalEntryId: journal.id,
        },
      });

      await tx.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
          dioceseId,
          parishId,
          processedAt: new Date(),
          donationId: donation.id,
        },
      });

      return { created: true, duplicate: false, donationId: donation.id };
    });
  } catch (err) {
    // A concurrent duplicate delivery loses the StripeEvent unique-id race.
    if (isUniqueViolation(err)) {
      const row = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
      return { created: false, duplicate: true, donationId: row?.donationId ?? undefined };
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

/** Any AppUser in the diocese to satisfy the createdBy FK for system entries. */
async function systemUserId(
  tx: Prisma.TransactionClient,
  dioceseId: string,
): Promise<string> {
  const user = await tx.appUser.findFirst({
    where: { dioceseId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!user) throw new Error('Stripe ingest: no user to attribute system entry');
  return user.id;
}
