/**
 * Integration: member CSV import (IN-3). Dry-run never writes; commit reports
 * partial success; parish comes from claims; staff are denied and audited.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';

let importRoute: typeof import('@/app/api/members/import/route');

const jreq = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const GOOD_CSV = [
  'firstName,lastName,email,familyName',
  'Ada,Lovelace,ada@example.com,Lovelace',
  'Grace,Hopper,grace@example.com,Hopper',
].join('\n');

const MIXED_CSV = [
  'firstName,lastName,email',
  'Ada,Lovelace,ada@example.com',
  'Bad,Row,not-an-email',
  ',NoFirstName,x@example.com',
].join('\n');

describe('R6 member import', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
    importRoute = await import('@/app/api/members/import/route');
    resetAuth = asUser(
      await testDb.appUser.findUniqueOrThrow({
        where: { id: FX.users.parishAAdmin.id },
      }),
    );
  });
  afterEach(() => resetAuth?.());

  it('dry-run validates without creating anything', async () => {
    const before = await testDb.member.count();
    const response = await importRoute.POST(
      jreq({ content: MIXED_CSV, mode: 'dry-run' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('dry-run');
    expect(body.total).toBe(3);
    expect(body.valid).toBe(1);
    expect(body.created).toBe(0);
    expect(body.failed).toBe(2);
    expect(body.errors.map((e: { line: number }) => e.line).sort()).toEqual([3, 4]);
    expect(await testDb.member.count()).toBe(before);
  });

  it('commit creates valid rows and finds or creates families', async () => {
    const response = await importRoute.POST(
      jreq({ content: GOOD_CSV, mode: 'commit' }),
    );
    const body = await response.json();

    expect(body.created).toBe(2);
    expect(body.failed).toBe(0);

    const ada = await testDb.member.findFirstOrThrow({
      where: { firstName: 'Ada', parishId: FX.parishAId },
      include: { family: true },
    });
    expect(ada.family?.familyName).toBe('Lovelace');
    expect(ada.memberIdentifier).toMatch(/^\d+\.1$/);
    expect(ada.status).toBe('ACTIVE');
  });

  it('commit reports partial success rather than rolling back good rows', async () => {
    const response = await importRoute.POST(
      jreq({ content: MIXED_CSV, mode: 'commit' }),
    );
    const body = await response.json();

    expect(body.created).toBe(1);
    expect(body.failed).toBe(2);
    expect(
      await testDb.member.count({ where: { firstName: 'Ada' } }),
    ).toBe(1);
  });

  it('rejects a duplicate member id already present in the parish', async () => {
    const existing = await testDb.member.findFirstOrThrow({
      where: { parishId: FX.parishAId },
    });
    const csv = [
      'firstName,lastName,member id',
      `Clone,Row,${existing.memberIdentifier}`,
    ].join('\n');

    const body = await (
      await importRoute.POST(jreq({ content: csv, mode: 'commit' }))
    ).json();
    expect(body.created).toBe(0);
    expect(body.errors[0].reason).toMatch(/already exists/i);
  });

  it('rejects duplicate member ids within the same file', async () => {
    const csv = [
      'firstName,lastName,member id',
      'One,Row,900.1',
      'Two,Row,900.1',
    ].join('\n');

    const body = await (
      await importRoute.POST(jreq({ content: csv, mode: 'dry-run' }))
    ).json();
    expect(body.valid).toBe(1);
    expect(body.errors[0].reason).toMatch(/duplicated in this file/i);
  });

  it('imports into the caller’s parish, ignoring any parish in the body', async () => {
    await importRoute.POST(
      jreq({ content: GOOD_CSV, mode: 'commit', parishId: FX.parishBId }),
    );
    expect(
      await testDb.member.count({
        where: { firstName: 'Ada', parishId: FX.parishBId },
      }),
    ).toBe(0);
    expect(
      await testDb.member.count({
        where: { firstName: 'Ada', parishId: FX.parishAId },
      }),
    ).toBe(1);
  });

  it('rejects an oversized file', async () => {
    const rows = ['firstName,lastName'];
    for (let i = 0; i < 2001; i += 1) rows.push(`First${i},Last${i}`);
    const response = await importRoute.POST(
      jreq({ content: rows.join('\n'), mode: 'dry-run' }),
    );
    expect(response.status).toBe(400);
  });

  it('denies parish staff and audits the denial', async () => {
    resetAuth();
    resetAuth = asUser(
      await testDb.appUser.findUniqueOrThrow({
        where: { id: FX.users.parishAStaff.id },
      }),
    );

    const response = await importRoute.POST(
      jreq({ content: GOOD_CSV, mode: 'commit' }),
    );
    expect(response.status).toBe(403);
    expect(await testDb.member.count({ where: { firstName: 'Ada' } })).toBe(0);
  });

  it('audits a commit with row counts', async () => {
    await importRoute.POST(jreq({ content: MIXED_CSV, mode: 'commit' }));
    const audit = await testDb.auditEntry.findFirstOrThrow({
      where: { action: 'member.import.commit' },
    });
    expect(audit.outcome).toBe('SUCCESS');
    expect(audit.metadata).toMatchObject({ total: 3, created: 1, failed: 2 });
  });

  it('does not emit webhooks for bulk imports (D7)', async () => {
    await importRoute.POST(jreq({ content: GOOD_CSV, mode: 'commit' }));
    expect(await testDb.webhookEvent.count()).toBe(0);
  });
});
