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

// Route handler under test — imported after the auth seam is in place
// so that top-level module execution picks up our injectable resolver.
let POST: (req: Request) => Promise<Response>;

async function loadRoute() {
  // Dynamic import avoids hoisting issues with the resolver override.
  const mod = await import('@/app/api/members/route');
  POST = mod.POST;
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

  it('returns 500 (Unauthorized) when called without a session', async () => {
    resetAuth = asGuest();

    const req = new Request('http://localhost/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Bob', lastName: 'Jones' }),
    });

    // requireSessionUser() throws 'Unauthorized' — the route doesn't catch it,
    // so we expect an unhandled rejection that the test should catch.
    await expect(POST(req)).rejects.toThrow('Unauthorized');
  });
});
