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
}> = [
  { code: '1000', name: 'Operating Cash', type: 'ASSET', fundName: 'General' },
  { code: '1010', name: 'Building Cash', type: 'ASSET', fundName: 'Building' },
  { code: '1100', name: 'Undeposited Funds', type: 'ASSET', fundName: 'General' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Net Assets — Unrestricted', type: 'EQUITY', fundName: 'General' },
  { code: '3100', name: 'Net Assets — Building', type: 'EQUITY', fundName: 'Building' },
  { code: '4000', name: 'Tithes & Offerings', type: 'INCOME', fundName: 'General' },
  { code: '4100', name: 'Building Fund Income', type: 'INCOME', fundName: 'Building' },
  { code: '4200', name: 'Missions Income', type: 'INCOME', fundName: 'Missions' },
  { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', fundName: 'General' },
  { code: '5100', name: 'Utilities', type: 'EXPENSE', fundName: 'General' },
  { code: '5200', name: 'Facilities & Maintenance', type: 'EXPENSE', fundName: 'Building' },
  { code: '5300', name: 'Missions Expense', type: 'EXPENSE', fundName: 'Missions' },
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
    if (existing) continue;
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
      },
    });
    createdAccounts += 1;
  }

  return { funds: fundIds.size, accountsCreated: createdAccounts };
}
