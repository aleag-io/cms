import type {
  JournalDirection,
  JournalSource,
  LedgerOwnerType,
  Prisma,
} from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { LedgerRef } from '@/lib/finance/ledger-scope';

/** A posting-rule violation (unbalanced, closed period, cross-ledger, …). */
export class PostingError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = 'PostingError';
  }
}

export interface DraftLine {
  accountId: string;
  direction: JournalDirection;
  amountCents: bigint;
  memo?: string;
}

export function assertBalanced(lines: DraftLine[]): void {
  if (lines.length < 2) {
    throw new PostingError('at least two lines required');
  }
  let debit = BigInt(0);
  let credit = BigInt(0);
  for (const line of lines) {
    if (line.amountCents <= BigInt(0)) {
      throw new PostingError('line amounts must be positive cents');
    }
    if (line.direction === 'DEBIT') debit += line.amountCents;
    else credit += line.amountCents;
  }
  if (debit !== credit) {
    throw new PostingError(`unbalanced: ${debit} != ${credit}`);
  }
  if (debit === BigInt(0)) {
    throw new PostingError('zero-total entry');
  }
}

export type PostJournalInput = {
  ledger: LedgerRef;
  periodId: string;
  entryDate: Date;
  description: string;
  reference?: string | null;
  source?: JournalSource;
  cashImpact?: boolean;
  status?: 'DRAFT' | 'POSTED' | 'PENDING_APPROVAL';
  reversesEntryId?: string | null;
  createdByUserId: string;
  postedByUserId?: string | null;
  lines: DraftLine[];
};

type Tx = Prisma.TransactionClient;

/** Resolve open period covering entryDate for the ledger owner. */
export async function findCoveringPeriod(
  tx: Tx,
  ledger: LedgerRef,
  entryDate: Date,
) {
  return tx.accountingPeriod.findFirst({
    where: {
      ownerType: ledger.ownerType,
      ownerId: ledger.ownerId,
      status: 'OPEN',
      startDate: { lte: entryDate },
      endDate: { gte: entryDate },
    },
  });
}

export async function postJournalEntry(tx: Tx, input: PostJournalInput) {
  assertBalanced(input.lines);

  const accounts = await tx.account.findMany({
    where: { id: { in: input.lines.map((l) => l.accountId) } },
  });
  if (accounts.length !== new Set(input.lines.map((l) => l.accountId)).size) {
    throw new PostingError('one or more accounts not found');
  }
  for (const acct of accounts) {
    if (
      acct.ownerType !== input.ledger.ownerType ||
      acct.ownerId !== input.ledger.ownerId
    ) {
      throw new PostingError('account is not on this ledger');
    }
  }

  const period = await tx.accountingPeriod.findUnique({
    where: { id: input.periodId },
  });
  if (!period || period.status === 'CLOSED') {
    throw new PostingError('period is closed or missing');
  }
  if (
    period.ownerType !== input.ledger.ownerType ||
    period.ownerId !== input.ledger.ownerId
  ) {
    throw new PostingError('period is not on this ledger');
  }

  const targetStatus = input.status ?? 'POSTED';
  const now = new Date();

  // IMPORTANT: the `assert_posted_lines_immutable` DB trigger rejects any line
  // INSERT whose parent entry is already POSTED. So we ALWAYS create the entry
  // as DRAFT (with its lines), then flip it to the target status in a second
  // step once the lines exist. This mirrors the seed's createPostedJournal and
  // keeps posted entries/lines genuinely immutable after the fact.
  const entry = await tx.journalEntry.create({
    data: {
      dioceseId: input.ledger.dioceseId,
      parishId: input.ledger.parishId,
      ownerType: input.ledger.ownerType as LedgerOwnerType,
      ownerId: input.ledger.ownerId,
      periodId: input.periodId,
      entryDate: input.entryDate,
      description: input.description,
      reference: input.reference ?? null,
      source: input.source ?? 'MANUAL',
      status: 'DRAFT',
      cashImpact: input.cashImpact ?? true,
      reversesEntryId: input.reversesEntryId ?? null,
      createdByUserId: input.createdByUserId,
      lines: {
        create: input.lines.map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amountCents: l.amountCents,
          memo: l.memo ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  if (targetStatus === 'DRAFT') return entry;

  return tx.journalEntry.update({
    where: { id: entry.id },
    data: {
      status: targetStatus,
      postedByUserId:
        targetStatus === 'POSTED'
          ? (input.postedByUserId ?? input.createdByUserId)
          : null,
      postedAt: targetStatus === 'POSTED' ? now : null,
    },
    include: { lines: true },
  });
}

/** Edit a DRAFT entry's header + replace its lines. POSTED entries are immutable. */
export async function updateDraftJournalEntry(
  tx: Tx,
  entryId: string,
  input: {
    entryDate?: Date;
    description?: string;
    reference?: string | null;
    cashImpact?: boolean;
    lines?: DraftLine[];
  },
) {
  const existing = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!existing) throw new ApiError(404, 'Journal entry not found');
  if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
    throw new ApiError(400, 'Only DRAFT entries can be edited');
  }

  if (input.lines) {
    assertBalanced(input.lines);
    const accounts = await tx.account.findMany({
      where: { id: { in: input.lines.map((l) => l.accountId) } },
    });
    for (const acct of accounts) {
      if (
        acct.ownerType !== existing.ownerType ||
        acct.ownerId !== existing.ownerId
      ) {
        throw new PostingError('account is not on this ledger');
      }
    }
    await tx.journalLine.deleteMany({ where: { journalEntryId: entryId } });
    await tx.journalLine.createMany({
      data: input.lines.map((l) => ({
        journalEntryId: entryId,
        accountId: l.accountId,
        direction: l.direction,
        amountCents: l.amountCents,
        memo: l.memo ?? null,
      })),
    });
  }

  return tx.journalEntry.update({
    where: { id: entryId },
    data: {
      ...(input.entryDate ? { entryDate: input.entryDate } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
      ...(input.cashImpact !== undefined ? { cashImpact: input.cashImpact } : {}),
      status: 'DRAFT',
    },
    include: { lines: true },
  });
}

export async function reverseJournalEntry(
  tx: Tx,
  entryId: string,
  actorUserId: string,
  description?: string,
) {
  const original = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!original) throw new ApiError(404, 'Journal entry not found');
  if (original.status !== 'POSTED') {
    throw new ApiError(400, 'Only POSTED entries can be reversed');
  }

  const flip = (d: JournalDirection): JournalDirection =>
    d === 'DEBIT' ? 'CREDIT' : 'DEBIT';

  return postJournalEntry(tx, {
    ledger: {
      ownerType: original.ownerType,
      ownerId: original.ownerId,
      dioceseId: original.dioceseId,
      parishId: original.parishId,
    },
    periodId: original.periodId,
    entryDate: original.entryDate,
    description:
      description ?? `Reversal of ${original.description}`.slice(0, 500),
    reference: original.reference,
    source: 'REVERSAL',
    cashImpact: original.cashImpact,
    status: 'POSTED',
    reversesEntryId: original.id,
    createdByUserId: actorUserId,
    lines: original.lines.map((l) => ({
      accountId: l.accountId,
      direction: flip(l.direction),
      amountCents: l.amountCents,
      memo: l.memo ?? undefined,
    })),
  });
}
