/**
 * Integration: Stripe ingestion idempotency (#4), giving statements (#7),
 * vendor bill → payment through approval, and cash/accrual basis switch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import { ingestStripeEvent } from '@/lib/finance/stripe';
import {
  computeFamilyStatement,
  computeMemberStatement,
} from '@/lib/finance/statements';

let vendors: typeof import('@/app/api/finance/vendors/route');
let bills: typeof import('@/app/api/finance/bills/route');
let billSubmit: typeof import('@/app/api/finance/bills/[id]/submit/route');
let payments: typeof import('@/app/api/finance/payments/route');
let genStatements: typeof import('@/app/api/finance/giving-statements/generate/route');
let sendStatements: typeof import('@/app/api/finance/giving-statements/send/route');
let summary: typeof import('@/app/api/finance/summary/route');

const FUND = '00000000-0000-0000-0000-0000000e0001';
const CASH = '00000000-0000-0000-0000-0000000e0002';
const INCOME = '00000000-0000-0000-0000-0000000e0003';
const EXPENSE = '00000000-0000-0000-0000-0000000e0004';
const AP = '00000000-0000-0000-0000-0000000e0005';
const PERIOD = '00000000-0000-0000-0000-0000000e0006';

async function seedLedger() {
  await testDb.fund.create({
    data: { id: FUND, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, name: 'General' },
  });
  await testDb.account.createMany({
    data: [
      { id: CASH, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '1000', name: 'Cash', type: 'ASSET', fundId: FUND },
      { id: INCOME, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4000', name: 'Offerings', type: 'INCOME', fundId: FUND },
      { id: EXPENSE, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '5000', name: 'Supplies', type: 'EXPENSE', fundId: FUND },
      { id: AP, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '2000', name: 'Accounts Payable', type: 'LIABILITY', fundId: FUND },
    ],
  });
  // Period covering both 2026 history and "today".
  await testDb.accountingPeriod.create({
    data: { id: PERIOD, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, startDate: new Date('2026-01-01'), endDate: new Date('2030-12-31'), status: 'OPEN' },
  });
}

describe('R5 finance modules', () => {
  let resetAuth: () => void;
  beforeEach(async () => {
    await resetTestDb();
    await seedLedger();
    vendors = await import('@/app/api/finance/vendors/route');
    bills = await import('@/app/api/finance/bills/route');
    billSubmit = await import('@/app/api/finance/bills/[id]/submit/route');
    payments = await import('@/app/api/finance/payments/route');
    genStatements = await import('@/app/api/finance/giving-statements/generate/route');
    sendStatements = await import('@/app/api/finance/giving-statements/send/route');
    summary = await import('@/app/api/finance/summary/route');
    const u = await testDb.appUser.findUniqueOrThrow({ where: { id: FX.users.parishAAdmin.id } });
    resetAuth = asUser(u);
  });
  afterEach(() => resetAuth?.());

  const jreq = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('Stripe: same event twice → one donation + one balanced journal (#4)', async () => {
    const event = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      amountCents: 5000n,
      metadata: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        fundId: FUND,
        cashAccountId: CASH,
        incomeAccountId: INCOME,
      },
    };
    const first = await ingestStripeEvent(testDb, event);
    const second = await ingestStripeEvent(testDb, event);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.duplicate).toBe(true);

    expect(await testDb.donation.count({ where: { externalTxnId: 'evt_test_1' } })).toBe(1);
    const stripeJournals = await testDb.journalEntry.findMany({ where: { source: 'STRIPE' }, include: { lines: true } });
    expect(stripeJournals).toHaveLength(1);
    const je = stripeJournals[0];
    const debit = je.lines.filter((l) => l.direction === 'DEBIT').reduce((a, l) => a + l.amountCents, 0n);
    const credit = je.lines.filter((l) => l.direction === 'CREDIT').reduce((a, l) => a + l.amountCents, 0n);
    expect(debit).toBe(credit);
    expect(je.status).toBe('POSTED');
  });

  it('Giving statements: member ⊆ family; send is idempotent (#7)', async () => {
    // Two donations for the Smith family; only one attributed to Alice.
    await testDb.donation.createMany({
      data: [
        { dioceseId: FX.dioceseId, parishId: FX.parishAId, familyId: FX.families.smithId, memberId: FX.members.aliceSmithId, fundId: FUND, periodId: PERIOD, amountCents: 10000n, method: 'CHECK', receivedAt: new Date('2026-03-01') },
        { dioceseId: FX.dioceseId, parishId: FX.parishAId, familyId: FX.families.smithId, memberId: null, fundId: FUND, periodId: PERIOD, amountCents: 5000n, method: 'CASH', receivedAt: new Date('2026-04-01') },
      ],
    });

    const family = await computeFamilyStatement(testDb, FX.families.smithId, 2026);
    const member = await computeMemberStatement(testDb, FX.members.aliceSmithId, 2026);
    expect(family.totalCents).toBe(15000n);
    expect(member.totalCents).toBe(10000n); // PA-22: family-only gift excluded
    expect(member.lineItems.length).toBeLessThanOrEqual(family.lineItems.length);

    const genRes = await genStatements.POST(jreq('/api/finance/giving-statements/generate', { taxYear: 2026, recipientType: 'ALL' }));
    expect((await genRes.json()).generated).toBeGreaterThanOrEqual(2);

    await sendStatements.POST(jreq('/api/finance/giving-statements/send', { taxYear: 2026 }));
    const auditsAfterFirst = await testDb.auditEntry.count({ where: { action: 'finance.statement.send' } });
    expect(auditsAfterFirst).toBeGreaterThanOrEqual(2);

    // Re-send without resend → no new sends (idempotent), no duplicate audit rows.
    await sendStatements.POST(jreq('/api/finance/giving-statements/send', { taxYear: 2026 }));
    const auditsAfterSecond = await testDb.auditEntry.count({ where: { action: 'finance.statement.send' } });
    expect(auditsAfterSecond).toBe(auditsAfterFirst);
  });

  it('Vendor bill → payment posts accrual then cash journal; bill becomes PAID', async () => {
    const vendorRes = await vendors.POST(jreq('/api/finance/vendors', { name: 'Acme Supplies' }));
    const vendor = (await vendorRes.json()).vendor;

    const billRes = await bills.POST(jreq('/api/finance/bills', { vendorId: vendor.id, amountCents: '12000', description: 'Candles', billDate: '2026-06-01' }));
    const bill = (await billRes.json()).bill;
    expect(bill.status).toBe('DRAFT');

    const submitRes = await billSubmit.POST(
      jreq(`/api/finance/bills/${bill.id}/submit`, { expenseAccountId: EXPENSE, apAccountId: AP }),
      { params: Promise.resolve({ id: bill.id }) },
    );
    expect((await submitRes.json()).bill.status).toBe('POSTED');
    const accrual = await testDb.journalEntry.findFirstOrThrow({ where: { source: 'VENDOR_BILL' } });
    expect(accrual.cashImpact).toBe(false);
    expect(accrual.status).toBe('POSTED');

    const payRes = await payments.POST(jreq('/api/finance/payments', { vendorBillId: bill.id, amountCents: '12000', cashAccountId: CASH, paidAt: '2026-06-05', method: 'CHECK' }));
    expect(payRes.status).toBe(201);
    const cashJournal = await testDb.journalEntry.findFirstOrThrow({ where: { source: 'PAYMENT' } });
    expect(cashJournal.cashImpact).toBe(true);
    expect((await testDb.vendorBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe('PAID');
  });

  it('Summary basis switch: cash excludes accrual-only entries', async () => {
    // Seed posted entries the way the engine does (DRAFT + lines, then POSTED)
    // so the posted-lines immutability trigger is satisfied.
    async function seedPosted(source: 'DONATION' | 'VENDOR_BILL', cashImpact: boolean, lines: { accountId: string; direction: 'DEBIT' | 'CREDIT'; amountCents: bigint }[]) {
      const e = await testDb.journalEntry.create({
        data: {
          dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId,
          periodId: PERIOD, entryDate: new Date('2026-05-01'), description: 'seed', source,
          status: 'DRAFT', cashImpact, createdByUserId: FX.users.parishAAdmin.id,
          lines: { create: lines },
        },
      });
      await testDb.journalEntry.update({ where: { id: e.id }, data: { status: 'POSTED', postedAt: new Date() } });
    }
    await seedPosted('DONATION', true, [
      { accountId: CASH, direction: 'DEBIT', amountCents: 8000n },
      { accountId: INCOME, direction: 'CREDIT', amountCents: 8000n },
    ]);
    await seedPosted('VENDOR_BILL', false, [
      { accountId: AP, direction: 'DEBIT', amountCents: 3000n },
      { accountId: INCOME, direction: 'CREDIT', amountCents: 3000n },
    ]);

    const accrualRes = await summary.GET(new Request('http://localhost/api/finance/summary?basis=accrual'));
    const cashRes = await summary.GET(new Request('http://localhost/api/finance/summary?basis=cash'));
    const accrual = (await accrualRes.json()).summary;
    const cash = (await cashRes.json()).summary;
    expect(BigInt(accrual.incomeCents)).toBe(11000n);
    expect(BigInt(cash.incomeCents)).toBe(8000n);
  });
});
