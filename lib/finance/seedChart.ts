/**
 * Idempotent default US church chart of accounts + funds for a ledger owner.
 */

import type { AccountType, Prisma } from '@prisma/client';
import type { LedgerRef } from '@/lib/finance/ledger-scope';

type Tx = Prisma.TransactionClient;

const DEFAULT_FUNDS = ['General', 'Building', 'Missions', 'Restricted'] as const;

const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  fundName?: string;
  /** Payments-side grouping for the Receipts & Payments report (R6). */
  reportSection?: string;
}> = [
  { code: '1000', name: 'Operating Cash', type: 'ASSET', fundName: 'General' },
  { code: '1010', name: 'Building Cash', type: 'ASSET', fundName: 'Building' },
  { code: '1100', name: 'Undeposited Funds', type: 'ASSET', fundName: 'General' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Net Assets — Unrestricted', type: 'EQUITY', fundName: 'General' },
  { code: '3100', name: 'Net Assets — Building', type: 'EQUITY', fundName: 'Building' },
  { code: '4000', name: 'Tithes & Offerings', type: 'INCOME', fundName: 'General' },
  // Giving-category income accounts (mapped by GivingCategory rows).
  { code: '4110', name: 'Subscription', type: 'INCOME', fundName: 'General' },
  { code: '4120', name: 'Offertory (Plate)', type: 'INCOME', fundName: 'General' },
  { code: '4130', name: 'Birthday Offertory', type: 'INCOME', fundName: 'General' },
  { code: '4140', name: 'Christmas Donation', type: 'INCOME', fundName: 'General' },
  { code: '4150', name: 'Special Donation', type: 'INCOME', fundName: 'General' },
  { code: '4160', name: 'Wedding Anniversary Offertory', type: 'INCOME', fundName: 'General' },
  { code: '4100', name: 'Building Fund Income', type: 'INCOME', fundName: 'Building' },
  { code: '4200', name: 'Missions Income', type: 'INCOME', fundName: 'Missions' },
  { code: '4210', name: 'Harvest (Donation/Auction)', type: 'INCOME', fundName: 'Missions' },
  { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', fundName: 'General', reportSection: 'Personnel' },
  { code: '5100', name: 'Utilities', type: 'EXPENSE', fundName: 'General', reportSection: 'Operations' },
  { code: '5200', name: 'Facilities & Maintenance', type: 'EXPENSE', fundName: 'Building', reportSection: 'Facilities' },
  { code: '5300', name: 'Missions Expense', type: 'EXPENSE', fundName: 'Missions', reportSection: 'Missions & Outreach' },
];

export async function seedDefaultChart(tx: Tx, ledger: LedgerRef) {
  const fundIds = new Map<string, string>();

  for (const name of DEFAULT_FUNDS) {
    const existing = await tx.fund.findFirst({
      where: {
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        name,
      },
    });
    if (existing) {
      fundIds.set(name, existing.id);
      continue;
    }
    const created = await tx.fund.create({
      data: {
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        name,
      },
    });
    fundIds.set(name, created.id);
  }

  let createdAccounts = 0;
  for (const def of DEFAULT_ACCOUNTS) {
    const existing = await tx.account.findFirst({
      where: {
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        code: def.code,
      },
    });
    if (existing) {
      // Backfill the R6 report grouping onto charts seeded before it existed,
      // otherwise those ledgers report every expense under "Other payments".
      if (def.reportSection && existing.reportSection !== def.reportSection) {
        await tx.account.update({
          where: { id: existing.id },
          data: { reportSection: def.reportSection },
        });
      }
      continue;
    }
    await tx.account.create({
      data: {
        dioceseId: ledger.dioceseId,
        parishId: ledger.parishId,
        ownerType: ledger.ownerType,
        ownerId: ledger.ownerId,
        code: def.code,
        name: def.name,
        type: def.type,
        fundId: def.fundName ? (fundIds.get(def.fundName) ?? null) : null,
        reportSection: def.reportSection ?? null,
      },
    });
    createdAccounts += 1;
  }

  return { funds: fundIds.size, accountsCreated: createdAccounts };
}
