/**
 * Integration: finance posting engine, maker-checker approval, period lifecycle.
 * Exit gates #1 (balanced posting), #2 (maker-checker), #3 (period lock + reopen).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';

let journal: typeof import('@/app/api/finance/journal/route');
let journalId: typeof import('@/app/api/finance/journal/[id]/route');
let reverse: typeof import('@/app/api/finance/journal/[id]/reverse/route');
let periods: typeof import('@/app/api/finance/periods/route');
let periodId: typeof import('@/app/api/finance/periods/[id]/route');
let reopen: typeof import('@/app/api/finance/periods/[id]/reopen/route');
let policies: typeof import('@/app/api/finance/approval-policies/route');
let decide: typeof import('@/app/api/finance/approvals/[id]/decide/route');
let donations: typeof import('@/app/api/finance/donations/route');

const FUND = '00000000-0000-0000-0000-0000000f0001';
const CASH = '00000000-0000-0000-0000-0000000f0002';
const INCOME = '00000000-0000-0000-0000-0000000f0003';
const EXPENSE = '00000000-0000-0000-0000-0000000f0004';
const PERIOD = '00000000-0000-0000-0000-0000000f0005';
const GLOBAL_ADMIN_ID = '00000000-0000-0000-0000-0000000f00aa';

async function loadRoutes() {
  journal = await import('@/app/api/finance/journal/route');
  journalId = await import('@/app/api/finance/journal/[id]/route');
  reverse = await import('@/app/api/finance/journal/[id]/reverse/route');
  periods = await import('@/app/api/finance/periods/route');
  periodId = await import('@/app/api/finance/periods/[id]/route');
  reopen = await import('@/app/api/finance/periods/[id]/reopen/route');
  policies = await import('@/app/api/finance/approval-policies/route');
  decide = await import('@/app/api/finance/approvals/[id]/decide/route');
  donations = await import('@/app/api/finance/donations/route');
}

async function seedLedger() {
  await testDb.fund.create({
    data: {
      id: FUND,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      name: 'General',
    },
  });
  await testDb.account.createMany({
    data: [
      { id: CASH, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '1000', name: 'Cash', type: 'ASSET', fundId: FUND },
      { id: INCOME, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4000', name: 'Offerings', type: 'INCOME', fundId: FUND },
      { id: EXPENSE, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '5000', name: 'Supplies', type: 'EXPENSE', fundId: FUND },
    ],
  });
  await testDb.accountingPeriod.create({
    data: {
      id: PERIOD,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: 'OPEN',
    },
  });
}

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/finance/journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const balancedLines = (amt: number) => [
  { accountId: CASH, direction: 'DEBIT', amountCents: amt },
  { accountId: INCOME, direction: 'CREDIT', amountCents: amt },
];

describe('R5 finance — posting + approval + periods', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
    await testDb.appUser.create({
      data: {
        id: GLOBAL_ADMIN_ID,
        email: 'global-admin@test.local',
        displayName: 'Global Admin',
        role: Role.GLOBAL_ADMIN,
        dioceseId: FX.dioceseId,
        parishId: null,
      },
    });
    await seedLedger();
    await loadRoutes();
  });
  afterEach(() => resetAuth?.());

  async function asParishAdmin() {
    const u = await testDb.appUser.findUniqueOrThrow({ where: { id: FX.users.parishAAdmin.id } });
    resetAuth = asUser(u);
    return u;
  }

  it('posts a balanced manual journal (auto-approves without a policy)', async () => {
    await asParishAdmin();
    const res = await journal.POST(
      jsonReq({ description: 'Sunday offering', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(5000) }),
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.entry.status).toBe('POSTED');

    const saved = await testDb.journalEntry.findUniqueOrThrow({ where: { id: data.entry.id }, include: { lines: true } });
    expect(saved.status).toBe('POSTED');
    const debit = saved.lines.filter((l) => l.direction === 'DEBIT').reduce((a, l) => a + l.amountCents, 0n);
    const credit = saved.lines.filter((l) => l.direction === 'CREDIT').reduce((a, l) => a + l.amountCents, 0n);
    expect(debit).toBe(credit);
  });

  it('rejects an unbalanced manual journal (400)', async () => {
    await asParishAdmin();
    const res = await journal.POST(
      jsonReq({ description: 'bad', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: [
        { accountId: CASH, direction: 'DEBIT', amountCents: 5000 },
        { accountId: INCOME, direction: 'CREDIT', amountCents: 4000 },
      ] }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a draft, edits its lines, then submits to post', async () => {
    await asParishAdmin();
    const created = await (await journal.POST(
      jsonReq({ description: 'draft', entryDate: '2026-06-01', periodId: PERIOD, submit: false, lines: balancedLines(1000) }),
    )).json();
    expect(created.entry.status).toBe('DRAFT');

    const edited = await journalId.PATCH(
      new Request('http://localhost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'edited', entryDate: '2026-06-02', periodId: PERIOD, lines: balancedLines(2500) }) }),
      { params: Promise.resolve({ id: created.entry.id }) },
    );
    const editedData = await edited.json();
    expect(editedData.entry.status).toBe('DRAFT');
    expect(editedData.entry.lines.map((l: { amountCents: string }) => l.amountCents)).toContain('2500');

    const submitted = await journalId.PATCH(
      new Request('http://localhost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) }),
      { params: Promise.resolve({ id: created.entry.id }) },
    );
    expect((await submitted.json()).entry.status).toBe('POSTED');
  });

  it('STRICT policy holds a journal for approval; maker cannot self-approve; approver posts it', async () => {
    const admin = await asParishAdmin();
    // Configure STRICT approval for JOURNAL on the parish ledger.
    await policies.POST(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'parish', entityKind: 'JOURNAL', mode: 'STRICT', approverRoles: ['PARISH_ADMIN', 'GLOBAL_ADMIN'] }) }));

    const submitted = await (await journal.POST(
      jsonReq({ description: 'needs approval', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(9000) }),
    )).json();
    expect(submitted.entry.status).toBe('PENDING_APPROVAL');

    const req = await testDb.approvalRequest.findFirstOrThrow({ where: { entityKind: 'JOURNAL', entityId: submitted.entry.id } });
    expect(req.status).toBe('PENDING');

    // Maker cannot self-approve.
    const selfRes = await decide.POST(
      new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE' }) }),
      { params: Promise.resolve({ id: req.id }) },
    );
    expect(selfRes.status).toBe(403);
    // Entry still not posted.
    expect((await testDb.journalEntry.findUniqueOrThrow({ where: { id: submitted.entry.id } })).status).toBe('PENDING_APPROVAL');

    // Another admin approves → entry posts.
    resetAuth();
    resetAuth = asUser(await testDb.appUser.findUniqueOrThrow({ where: { id: GLOBAL_ADMIN_ID } }));
    const okRes = await decide.POST(
      new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE' }) }),
      { params: Promise.resolve({ id: req.id }) },
    );
    expect(okRes.status).toBe(200);
    expect((await testDb.journalEntry.findUniqueOrThrow({ where: { id: submitted.entry.id } })).status).toBe('POSTED');
    void admin;
  });

  it('THRESHOLD_BASED auto-posts below threshold and holds above', async () => {
    await asParishAdmin();
    await policies.POST(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'parish', entityKind: 'JOURNAL', mode: 'THRESHOLD_BASED', thresholdCents: '10000' }) }));

    const below = await (await journal.POST(jsonReq({ description: 'small', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(5000) }))).json();
    expect(below.entry.status).toBe('POSTED');

    const above = await (await journal.POST(jsonReq({ description: 'big', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(20000) }))).json();
    expect(above.entry.status).toBe('PENDING_APPROVAL');
  });

  it('rejects posting into a CLOSED period (DB + app)', async () => {
    await asParishAdmin();
    await periodId.PATCH(
      new Request('http://localhost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CLOSE' }) }),
      { params: Promise.resolve({ id: PERIOD }) },
    );
    const res = await journal.POST(jsonReq({ description: 'into closed', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(1000) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await testDb.journalEntry.count({ where: { periodId: PERIOD } })).toBe(0);
  });

  it('donation records exactly one balanced posted journal', async () => {
    await asParishAdmin();
    const res = await donations.POST(new Request('http://localhost/api/finance/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyId: FX.families.smithId, amountCents: '7500', method: 'CASH', receivedAt: '2026-06-01', periodId: PERIOD, cashAccountId: CASH, incomeAccountId: INCOME, fundId: FUND }),
    }));
    const data = await res.json();
    expect(res.status).toBe(201);
    const je = await testDb.journalEntry.findUniqueOrThrow({ where: { id: data.donation.journalEntryId }, include: { lines: true } });
    expect(je.status).toBe('POSTED');
    expect(je.source).toBe('DONATION');
    const debit = je.lines.filter((l) => l.direction === 'DEBIT').reduce((a, l) => a + l.amountCents, 0n);
    expect(debit).toBe(7500n);
  });

  it('GLOBAL_ADMIN reopens a closed period with a reason (audited); parish admin is blocked', async () => {
    await asParishAdmin();
    await periodId.PATCH(
      new Request('http://localhost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CLOSE' }) }),
      { params: Promise.resolve({ id: PERIOD }) },
    );
    // Parish admin cannot reopen.
    const denied = await reopen.POST(
      new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'fix' }) }),
      { params: Promise.resolve({ id: PERIOD }) },
    );
    expect(denied.status).toBe(403);

    resetAuth();
    resetAuth = asUser(await testDb.appUser.findUniqueOrThrow({ where: { id: GLOBAL_ADMIN_ID } }));
    const ok = await reopen.POST(
      new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'correcting an error' }) }),
      { params: Promise.resolve({ id: PERIOD }) },
    );
    expect(ok.status).toBe(200);
    const audit = await testDb.auditEntry.findFirst({ where: { action: 'finance.period.reopen', entityId: PERIOD } });
    expect(audit).not.toBeNull();
  });

  it('diocese admin posts into the diocese OWN standalone ledger (owner=diocese)', async () => {
    // Diocese-scoped ledger: ownerType DIOCESE, ownerId = dioceseId, parishId null.
    const D_FUND = '00000000-0000-0000-0000-0000000f00d1';
    const D_CASH = '00000000-0000-0000-0000-0000000f00d2';
    const D_INCOME = '00000000-0000-0000-0000-0000000f00d3';
    const D_PERIOD = '00000000-0000-0000-0000-0000000f00d4';
    await testDb.fund.create({ data: { id: D_FUND, dioceseId: FX.dioceseId, parishId: null, ownerType: 'DIOCESE', ownerId: FX.dioceseId, name: 'Diocese General' } });
    await testDb.account.createMany({
      data: [
        { id: D_CASH, dioceseId: FX.dioceseId, parishId: null, ownerType: 'DIOCESE', ownerId: FX.dioceseId, code: '1000', name: 'Diocese Cash', type: 'ASSET', fundId: D_FUND },
        { id: D_INCOME, dioceseId: FX.dioceseId, parishId: null, ownerType: 'DIOCESE', ownerId: FX.dioceseId, code: '4000', name: 'Diocese Income', type: 'INCOME', fundId: D_FUND },
      ],
    });
    await testDb.accountingPeriod.create({ data: { id: D_PERIOD, dioceseId: FX.dioceseId, parishId: null, ownerType: 'DIOCESE', ownerId: FX.dioceseId, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'OPEN' } });

    resetAuth = asUser(await testDb.appUser.findUniqueOrThrow({ where: { id: FX.users.dioceseAdmin.id } }));
    const res = await journal.POST(
      new Request('http://localhost/api/finance/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'diocese',
          description: 'Diocese gift',
          entryDate: '2026-06-01',
          periodId: D_PERIOD,
          submit: true,
          lines: [
            { accountId: D_CASH, direction: 'DEBIT', amountCents: 4200 },
            { accountId: D_INCOME, direction: 'CREDIT', amountCents: 4200 },
          ],
        }),
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.entry.status).toBe('POSTED');
    const saved = await testDb.journalEntry.findUniqueOrThrow({ where: { id: data.entry.id } });
    expect(saved.ownerType).toBe('DIOCESE');
    expect(saved.ownerId).toBe(FX.dioceseId);
    expect(saved.parishId).toBeNull();
  });

  it('reverses a posted entry with a mirror-image balanced entry', async () => {
    await asParishAdmin();
    const posted = await (await journal.POST(jsonReq({ description: 'to reverse', entryDate: '2026-06-01', periodId: PERIOD, submit: true, lines: balancedLines(3000) }))).json();
    const rev = await reverse.POST(
      new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: posted.entry.id }) },
    );
    const revData = await rev.json();
    expect(rev.status).toBe(200);
    expect(revData.entry.reversesEntryId).toBe(posted.entry.id);
    expect(revData.entry.status).toBe('POSTED');
    // Debit/credit directions flipped.
    const origDebitAcct = posted.entry.lines.find((l: { direction: string }) => l.direction === 'DEBIT').accountId;
    const revLineForAcct = revData.entry.lines.find((l: { accountId: string }) => l.accountId === origDebitAcct);
    expect(revLineForAcct.direction).toBe('CREDIT');
  });
});
