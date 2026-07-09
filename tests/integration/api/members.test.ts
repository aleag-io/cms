/**
 * Integration tests for POST /api/members
 *
 * These tests call the route handler directly (no HTTP server), inject a
 * fixture session via the auth seam, and assert against the real test DB.
 *
 * The test DB is reset + seeded once before the suite by tests/setup/integration.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX } from '../../helpers/db';
import { asUser, asGuest } from '../../helpers/auth';

// Route handlers under test — imported after the auth seam is in place
// so that top-level module execution picks up our injectable resolver.
let POST: (req: Request) => Promise<Response>;
let DELETE: (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

async function loadRoute() {
  // Dynamic import avoids hoisting issues with the resolver override.
  const mod = await import('@/app/api/members/route');
  POST = mod.POST;
}

async function loadMemberIdRoute() {
  const mod = await import('@/app/api/members/[id]/route');
  DELETE = mod.DELETE;
}

describe('POST /api/members', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoute();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('returns 200 and creates member + audit row when called as Parish Admin', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const before = await testDb.member.count({ where: { parishId: FX.parishAId } });

    const req = new Request('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        familyId: FX.families.smithId,
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice.smith@test.local',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.member.firstName).toBe('Alice');
    expect(data.member.memberIdentifier).toMatch(/^100\.\d+$/);

    // DB row was created
    const after = await testDb.member.count({ where: { parishId: FX.parishAId } });
    expect(after).toBe(before + 1);

    // Audit entry was written
    const audit = await testDb.auditEntry.findFirst({
      where: { entityId: data.member.id, action: 'membership.member.create' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.outcome).toBe('SUCCESS');
    expect(audit!.actorUserId).toBe(admin.id);
  });

  it('returns 400 when firstName is missing', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const req = new Request('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastName: 'Smith' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/firstName/i);
  });

  it('returns 401 when called without a session', async () => {
    resetAuth = asGuest();

    const req = new Request('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Bob', lastName: 'Jones' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/unauthorized/i);
  });
});

describe('DELETE /api/members/[id]', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadMemberIdRoute();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('deactivates a member and writes an audit row as Parish Admin', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await DELETE(new Request('http://localhost/api/members/x'), {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.member.status).toBe('INACTIVE');

    const row = await testDb.member.findUniqueOrThrow({
      where: { id: FX.members.aliceSmithId },
    });
    expect(row.status).toBe('INACTIVE');

    const audit = await testDb.auditEntry.findFirst({
      where: {
        entityId: FX.members.aliceSmithId,
        action: 'membership.member.deactivate',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.outcome).toBe('SUCCESS');
  });

  it('returns 409 when the member is already inactive', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    await testDb.member.update({
      where: { id: FX.members.aliceSmithId },
      data: { status: 'INACTIVE' },
    });

    const res = await DELETE(new Request('http://localhost/api/members/x'), {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
  });

  it('returns 403 when called as Parish Staff', async () => {
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const res = await DELETE(new Request('http://localhost/api/members/x'), {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.ok).toBe(false);
  });

  it('returns 404 for a cross-parish member id', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const res = await DELETE(new Request('http://localhost/api/members/x'), {
      params: Promise.resolve({ id: FX.members.bobJonesBId }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.ok).toBe(false);
  });
});
