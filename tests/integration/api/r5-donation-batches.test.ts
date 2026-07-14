/**
 * Integration: batch donation entry posts ONE consolidated deposit journal,
 * crediting each category's income account by subtotal; members / non-members /
 * anonymous plate all supported. Batch locks on post.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';

let batches: typeof import('@/app/api/finance/donation-batches/route');
let batchDetail: typeof import('@/app/api/finance/donation-batches/[id]/route');
let addLines: typeof import('@/app/api/finance/donation-batches/[id]/donations/route');
let postBatch: typeof import('@/app/api/finance/donation-batches/[id]/post/route');

const FUND = '00000000-0000-0000-0000-0000000b0001';
const CASH = '00000000-0000-0000-0000-0000000b0002';
const INC_SUB = '00000000-0000-0000-0000-0000000b0003';
const INC_PLATE = '00000000-0000-0000-0000-0000000b0004';
const PERIOD = '00000000-0000-0000-0000-0000000b0005';
const CAT_SUB = '00000000-0000-0000-0000-0000000b0006';
const CAT_PLATE = '00000000-0000-0000-0000-0000000b0007';
const EXT_DONOR = '00000000-0000-0000-0000-0000000b0008';

async function seed() {
  await testDb.fund.create({ data: { id: FUND, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, name: 'General' } });
  await testDb.account.createMany({
    data: [
      { id: CASH, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '1000', name: 'Cash', type: 'ASSET', fundId: FUND },
      { id: INC_SUB, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4110', name: 'Subscription', type: 'INCOME', fundId: FUND },
      { id: INC_PLATE, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4120', name: 'Offertory (Plate)', type: 'INCOME', fundId: FUND },
    ],
  });
  await testDb.accountingPeriod.create({ data: { id: PERIOD, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'OPEN' } });
  await testDb.givingCategory.createMany({
    data: [
      { id: CAT_SUB, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, name: 'Subscription', section: 'Church Operation', sortOrder: 1, fundId: FUND, incomeAccountId: INC_SUB, updatedAt: new Date() },
      { id: CAT_PLATE, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, name: 'Offertory (Plate)', section: 'Church Operation', sortOrder: 2, fundId: FUND, incomeAccountId: INC_PLATE, updatedAt: new Date() },
    ],
  });
  await testDb.externalDonor.create({ data: { id: EXT_DONOR, dioceseId: FX.dioceseId, parishId: FX.parishAId, name: 'Visitor Jones', updatedAt: new Date() } });
}

describe('R5 donation batches', () => {
  let resetAuth: () => void;
  beforeEach(async () => {
    await resetTestDb();
    await seed();
    batches = await import('@/app/api/finance/donation-batches/route');
    batchDetail = await import('@/app/api/finance/donation-batches/[id]/route');
    addLines = await import('@/app/api/finance/donation-batches/[id]/donations/route');
    postBatch = await import('@/app/api/finance/donation-batches/[id]/post/route');
    resetAuth = asUser(await testDb.appUser.findUniqueOrThrow({ where: { id: FX.users.parishAAdmin.id } }));
  });
  afterEach(() => resetAuth?.());

  const jreq = (b: unknown) =>
    new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  it('posts one consolidated deposit journal crediting each category subtotal', async () => {
    // Create OPEN batch.
    const created = await (await batches.POST(jreq({ owner: 'parish', batchDate: '2026-06-07', label: 'Sun 2026-06-07' }))).json();
    const batchId = created.batch.id;
    expect(created.batch.status).toBe('OPEN');

    // Add three gifts: member (sub 10000), external donor (sub 5000), anonymous plate (2500).
    await addLines.POST(
      jreq({ lines: [
        { amountCents: '10000', categoryId: CAT_SUB, method: 'CHECK', familyId: FX.families.smithId, memberId: FX.members.aliceSmithId },
        { amountCents: '5000', categoryId: CAT_SUB, method: 'CHECK', externalDonorId: EXT_DONOR },
        { amountCents: '2500', categoryId: CAT_PLATE, method: 'CASH', isAnonymous: true },
      ] }),
      { params: Promise.resolve({ id: batchId }) },
    );

    const detail = await (await batchDetail.GET(new Request('http://localhost'), { params: Promise.resolve({ id: batchId }) })).json();
    expect(detail.batch.donationCount).toBe(3);
    expect(detail.batch.totalCents).toBe('17500');

    // Post the batch.
    const posted = await postBatch.POST(jreq({ depositAccountId: CASH }), { params: Promise.resolve({ id: batchId }) });
    const postedData = await posted.json();
    expect(posted.status).toBe(200);

    // Exactly one journal entry, balanced, with correct category subtotals.
    const je = await testDb.journalEntry.findUniqueOrThrow({ where: { id: postedData.journalEntryId }, include: { lines: true } });
    expect(je.source).toBe('DONATION');
    expect(je.status).toBe('POSTED');
    const debit = je.lines.filter((l) => l.direction === 'DEBIT');
    expect(debit).toHaveLength(1);
    expect(debit[0].accountId).toBe(CASH);
    expect(debit[0].amountCents).toBe(17500n);
    const credits = Object.fromEntries(je.lines.filter((l) => l.direction === 'CREDIT').map((l) => [l.accountId, l.amountCents]));
    expect(credits[INC_SUB]).toBe(15000n); // 10000 + 5000
    expect(credits[INC_PLATE]).toBe(2500n);

    // Batch locked + donations linked to the one entry.
    const batch = await testDb.donationBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('POSTED');
    const donations = await testDb.donation.findMany({ where: { batchId } });
    expect(donations.every((d) => d.journalEntryId === postedData.journalEntryId)).toBe(true);

    // Re-posting is rejected.
    const again = await postBatch.POST(jreq({ depositAccountId: CASH }), { params: Promise.resolve({ id: batchId }) });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects posting a batch with no gifts', async () => {
    const created = await (await batches.POST(jreq({ owner: 'parish', batchDate: '2026-06-07', label: 'Empty' }))).json();
    const res = await postBatch.POST(jreq({ depositAccountId: CASH }), { params: Promise.resolve({ id: created.batch.id }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
