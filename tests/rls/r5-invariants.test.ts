/**
 * @rls @r5 @m10
 * DB-enforced finance invariants: balance, period lock, posted immutability.
 * Multi-level: exercises parish ledger (same triggers apply to all owners).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const adminA = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});

const FUND_ID = '00000000-0000-0000-0000-000000000701';
const CASH_ID = '00000000-0000-0000-0000-000000000702';
const INCOME_ID = '00000000-0000-0000-0000-000000000703';
const PERIOD_ID = '00000000-0000-0000-0000-000000000704';
const PERIOD_CLOSED_ID = '00000000-0000-0000-0000-000000000705';

async function seedLedger() {
  await testDb.fund.create({
    data: {
      id: FUND_ID,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      name: 'General',
    },
  });
  await testDb.account.createMany({
    data: [
      {
        id: CASH_ID,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        ownerType: 'PARISH',
        ownerId: FX.parishAId,
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        fundId: FUND_ID,
      },
      {
        id: INCOME_ID,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        ownerType: 'PARISH',
        ownerId: FX.parishAId,
        code: '4000',
        name: 'Offerings',
        type: 'INCOME',
        fundId: FUND_ID,
      },
    ],
  });
  await testDb.accountingPeriod.createMany({
    data: [
      {
        id: PERIOD_ID,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        ownerType: 'PARISH',
        ownerId: FX.parishAId,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'OPEN',
      },
      {
        id: PERIOD_CLOSED_ID,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        ownerType: 'PARISH',
        ownerId: FX.parishAId,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: 'CLOSED',
      },
    ],
  });
}

describe('r5 finance invariants', () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    await seedLedger();
  });
  afterAll(async () => {
    await closeRlsPool();
  });

  it('rejects unbalanced journal lines at commit', async () => {
    await expect(
      withTenantSession(adminA, async (client) => {
        const entryId = '00000000-0000-0000-0000-000000000710';
        await client.query(
          `INSERT INTO "JournalEntry" (
            id, "dioceseId", "parishId", "ownerType", "ownerId", "periodId",
            "entryDate", description, status, "createdByUserId"
          ) VALUES ($1,$2,$3,'PARISH',$3,$4,'2026-06-01','unbalanced','DRAFT',$5)`,
          [
            entryId,
            FX.dioceseId,
            FX.parishAId,
            PERIOD_ID,
            FX.users.parishAAdmin.id,
          ],
        );
        await client.query(
          `INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", direction, "amountCents")
           VALUES (gen_random_uuid(), $1, $2, 'DEBIT', 1000)`,
          [entryId, CASH_ID],
        );
        await client.query(
          `INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", direction, "amountCents")
           VALUES (gen_random_uuid(), $1, $2, 'CREDIT', 999)`,
          [entryId, INCOME_ID],
        );
        // deferred trigger fires at COMMIT — force by releasing savepoint pattern:
        // withTenantSession rolls back; use a nested commit simulation via constraint
        // by ending the transaction work — we raise by SET CONSTRAINTS ALL IMMEDIATE
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      }),
    ).rejects.toThrow(/unbalanced/i);
  });

  it('rejects insert into CLOSED period', async () => {
    await expect(
      withTenantSession(adminA, async (client) => {
        await client.query(
          `INSERT INTO "JournalEntry" (
            id, "dioceseId", "parishId", "ownerType", "ownerId", "periodId",
            "entryDate", description, status, "createdByUserId"
          ) VALUES (gen_random_uuid(), $1, $2, 'PARISH', $2, $3, '2025-06-01', 'closed', 'DRAFT', $4)`,
          [
            FX.dioceseId,
            FX.parishAId,
            PERIOD_CLOSED_ID,
            FX.users.parishAAdmin.id,
          ],
        );
      }),
    ).rejects.toThrow(/closed/i);
  });

  it('allows balanced multi-line draft entry', async () => {
    const entryId = '00000000-0000-0000-0000-000000000711';
    await withTenantSession(adminA, async (client) => {
      await client.query(
        `INSERT INTO "JournalEntry" (
          id, "dioceseId", "parishId", "ownerType", "ownerId", "periodId",
          "entryDate", description, status, "createdByUserId"
        ) VALUES ($1,$2,$3,'PARISH',$3,$4,'2026-06-01','ok','DRAFT',$5)`,
        [
          entryId,
          FX.dioceseId,
          FX.parishAId,
          PERIOD_ID,
          FX.users.parishAAdmin.id,
        ],
      );
      await client.query(
        `INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", direction, "amountCents")
         VALUES (gen_random_uuid(), $1, $2, 'DEBIT', 2500)`,
        [entryId, CASH_ID],
      );
      await client.query(
        `INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", direction, "amountCents")
         VALUES (gen_random_uuid(), $1, $2, 'CREDIT', 2500)`,
        [entryId, INCOME_ID],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM "JournalLine" WHERE "journalEntryId" = $1`,
        [entryId],
      );
      expect(rows[0].n).toBe(2);
    });
  });

  it('parish A cannot read parish B ledger accounts', async () => {
    await testDb.account.create({
      data: {
        id: '00000000-0000-0000-0000-000000000720',
        dioceseId: FX.dioceseId,
        parishId: FX.parishBId,
        ownerType: 'PARISH',
        ownerId: FX.parishBId,
        code: '1000',
        name: 'B Cash',
        type: 'ASSET',
      },
    });

    const seen = await withTenantSession(adminA, async (client) => {
      const { rows } = await client.query(
        `SELECT id FROM "Account" WHERE "ownerId" = $1`,
        [FX.parishBId],
      );
      return rows;
    });
    expect(seen).toHaveLength(0);
  });
});
