/**
 * Integration: liturgical observance API — validation, scoping, and mutation
 * guards (R4 / M9).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';

let list: typeof import('@/app/api/liturgical/route');
let byId: typeof import('@/app/api/liturgical/[id]/route');

async function loadRoutes() {
  list = await import('@/app/api/liturgical/route');
  byId = await import('@/app/api/liturgical/[id]/route');
}

async function actAs(userId: string) {
  const user = await testDb.appUser.findUniqueOrThrow({ where: { id: userId } });
  return asUser(user);
}

function postReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/liturgical', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchReq(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/liturgical/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('R4 liturgical API', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
    await loadRoutes();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('diocese admin publishes an observance and audit is written', async () => {
    resetAuth = await actAs(FX.users.dioceseAdmin.id);

    const res = await list.POST(
      postReq({ title: 'Denaha', observanceType: 'FEAST', month: 1, day: 6 }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.observance.parishId).toBeNull();

    const audit = await testDb.auditEntry.findFirst({
      where: {
        action: 'liturgical.observance.create',
        entityId: data.observance.id,
      },
    });
    expect(audit?.outcome).toBe('SUCCESS');
  });

  it('rejects invalid month, day, observanceType, and empty title', async () => {
    resetAuth = await actAs(FX.users.dioceseAdmin.id);

    expect((await list.POST(postReq({ title: 'X', month: 13 }))).status).toBe(400);
    expect((await list.POST(postReq({ title: 'X', day: 32 }))).status).toBe(400);
    expect(
      (await list.POST(postReq({ title: 'X', observanceType: 'BOGUS' }))).status,
    ).toBe(400);
    expect((await list.POST(postReq({ title: '  ' }))).status).toBe(400);
    expect(
      (await list.POST(postReq({ title: 'X', occursOn: 'not-a-date' }))).status,
    ).toBe(400);
  });

  it('PATCH validates observanceType instead of erroring in the DB', async () => {
    resetAuth = await actAs(FX.users.dioceseAdmin.id);
    const created = await testDb.liturgicalObservance.create({
      data: {
        dioceseId: FX.dioceseId,
        title: 'Feast',
        observanceType: 'FEAST',
        isPublished: true,
      },
    });

    const bad = await byId.PATCH(
      patchReq(created.id, { observanceType: 'NOPE' }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(bad.status).toBe(400);

    const ok = await byId.PATCH(
      patchReq(created.id, { observanceType: 'HOLY_DAY', isPublished: false }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).observance.observanceType).toBe('HOLY_DAY');
  });

  it('parish admin manages parish-local rows but cannot touch diocese rows', async () => {
    resetAuth = await actAs(FX.users.parishAAdmin.id);

    const created = await list.POST(
      postReq({ title: 'Parish feast', parishLocal: true, month: 3, day: 1 }),
    );
    const data = await created.json();
    expect(created.status).toBe(200);
    expect(data.observance.parishId).toBe(FX.parishAId);

    const dioceseRow = await testDb.liturgicalObservance.create({
      data: {
        dioceseId: FX.dioceseId,
        title: 'Diocese feast',
        observanceType: 'FEAST',
        isPublished: true,
      },
    });

    const patchDenied = await byId.PATCH(
      patchReq(dioceseRow.id, { title: 'hacked' }),
      { params: Promise.resolve({ id: dioceseRow.id }) },
    );
    expect(patchDenied.status).toBe(403);

    const deleteDenied = await byId.DELETE(
      new Request(`http://localhost/api/liturgical/${dioceseRow.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: dioceseRow.id }) },
    );
    expect(deleteDenied.status).toBe(403);
  });

  it('parish admin cannot mutate another parish’s local observance', async () => {
    const parishBRow = await testDb.liturgicalObservance.create({
      data: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishBId,
        title: 'Parish B feast',
        observanceType: 'OTHER',
        isPublished: true,
      },
    });

    resetAuth = await actAs(FX.users.parishAAdmin.id);

    // RLS hides the row entirely — 404, not 403.
    const res = await byId.PATCH(patchReq(parishBRow.id, { title: 'hacked' }), {
      params: Promise.resolve({ id: parishBRow.id }),
    });
    expect(res.status).toBe(404);
  });
});
