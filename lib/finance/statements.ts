/**
 * Annual giving statements (§2.11.10, PA-22).
 *
 * Member statements include ONLY donations where memberId = that member — a
 * family donation is never allocated across members. Family statements include
 * all of the family's donations for the tax year regardless of memberId.
 */

import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type StatementDonation = {
  receivedAt: Date;
  amountCents: bigint;
  method: string;
  fundName: string | null;
};

export type StatementLineItem = {
  date: string;
  fundName: string;
  method: string;
  amountCents: bigint;
};

export type ComputedStatement = {
  recipientName: string;
  taxYear: number;
  lineItems: StatementLineItem[];
  totalCents: bigint;
};

/** Pure: turn a donation list into ordered line items + total. */
export function donationsToStatement(
  recipientName: string,
  taxYear: number,
  donations: StatementDonation[],
): ComputedStatement {
  const lineItems = donations
    .slice()
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((d) => ({
      date: d.receivedAt.toISOString().slice(0, 10),
      fundName: d.fundName ?? 'General',
      method: d.method,
      amountCents: d.amountCents,
    }));
  const totalCents = lineItems.reduce((a, l) => a + l.amountCents, BigInt(0));
  return { recipientName, taxYear, lineItems, totalCents };
}

function yearRange(taxYear: number) {
  return {
    gte: new Date(Date.UTC(taxYear, 0, 1)),
    lte: new Date(Date.UTC(taxYear, 11, 31, 23, 59, 59)),
  };
}

/** Resolve fund names for a set of donations (Donation has no fund relation). */
async function withFundNames(
  tx: Tx,
  donations: { receivedAt: Date; amountCents: bigint; method: string; fundId: string | null }[],
): Promise<StatementDonation[]> {
  const fundIds = [...new Set(donations.map((d) => d.fundId).filter((id): id is string => !!id))];
  const funds = fundIds.length
    ? await tx.fund.findMany({ where: { id: { in: fundIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(funds.map((f) => [f.id, f.name]));
  return donations.map((d) => ({
    receivedAt: d.receivedAt,
    amountCents: d.amountCents,
    method: d.method,
    fundName: d.fundId ? (nameById.get(d.fundId) ?? null) : null,
  }));
}

export async function computeFamilyStatement(
  tx: Tx,
  familyId: string,
  taxYear: number,
): Promise<ComputedStatement> {
  const family = await tx.family.findUnique({
    where: { id: familyId },
    select: { familyName: true },
  });
  const donations = await tx.donation.findMany({
    where: { familyId, status: 'ACTIVE', receivedAt: yearRange(taxYear) },
    select: { receivedAt: true, amountCents: true, method: true, fundId: true },
  });
  return donationsToStatement(
    family?.familyName ?? 'Family',
    taxYear,
    await withFundNames(tx, donations),
  );
}

export async function computeMemberStatement(
  tx: Tx,
  memberId: string,
  taxYear: number,
): Promise<ComputedStatement> {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true },
  });
  // PA-22: strictly memberId-attributed donations only.
  const donations = await tx.donation.findMany({
    where: { memberId, status: 'ACTIVE', receivedAt: yearRange(taxYear) },
    select: { receivedAt: true, amountCents: true, method: true, fundId: true },
  });
  const name = member ? `${member.firstName} ${member.lastName}`.trim() : 'Member';
  return donationsToStatement(name, taxYear, await withFundNames(tx, donations));
}
