/**
 * @phase:9 @integration
 *
 * R1 People Core — bootstrap guard, member self-service edit, and
 * communication opt-in/out (Phase 5 + 9 exit gates).
 */
import { AuditOutcome } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asGuest, asUser } from '../../helpers/auth';
import { FX, testDb } from '../../helpers/db';

let bootstrapPOST: (request: Request) => Promise<Response>;
let memberPATCH: (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
let commPrefsGET: () => Promise<Response>;
let commPrefsPUT: (request: Request) => Promise<Response>;

async function loadRoutes() {
  ({ POST: bootstrapPOST } = await import('@/app/api/bootstrap/route'));
  ({ PATCH: memberPATCH } = await import('@/app/api/members/[id]/route'));
  ({ GET: commPrefsGET, PUT: commPrefsPUT } = await import(
    '@/app/api/self-service/communication-preferences/route'
  ));
}

function patchRequest(body: unknown): Request {
  return new Request('http://test/api/members/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('R1 self-service & provisioning guards', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoutes();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('bootstrap refuses once a diocese admin exists (no privilege escalation)', async () => {
    resetAuth = asGuest();

    const res = await bootstrapPOST(
      new Request('http://test/api/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          adminEmail: 'attacker@evil.test',
          adminPassword: 'Attacker123!',
        }),
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);

    // No attacker account was created…
    const attacker = await testDb.appUser.findFirst({
      where: { email: 'attacker@evil.test' },
    });
    expect(attacker).toBeNull();

    // …and the denied attempt is audited.
    const denied = await testDb.auditEntry.findFirst({
      where: { action: 'bootstrap.initialize', outcome: AuditOutcome.DENIED },
      orderBy: { timestamp: 'desc' },
    });
    expect(denied).toBeTruthy();
  });

  it('member can update own contact fields; the change is audited', async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const res = await memberPATCH(
      patchRequest({ email: 'alice-self@test.local', phone: '555-0100' }),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.member.email).toBe('alice-self@test.local');
    expect(data.member.phone).toBe('555-0100');

    const audit = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.member.update',
        entityId: FX.members.aliceSmithId,
        actorUserId: memberUser.id,
        outcome: AuditOutcome.SUCCESS,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('member cannot update non-contact fields (403, audited as DENIED)', async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const res = await memberPATCH(
      patchRequest({ firstName: 'Renamed', email: 'x@test.local' }),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    expect(res.status).toBe(403);

    const denied = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.member.update',
        actorUserId: memberUser.id,
        outcome: AuditOutcome.DENIED,
      },
    });
    expect(denied).toBeTruthy();

    const alice = await testDb.member.findUniqueOrThrow({
      where: { id: FX.members.aliceSmithId },
    });
    expect(alice.firstName).not.toBe('Renamed');
  });

  it("member cannot update another member's profile (403)", async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const res = await memberPATCH(patchRequest({ email: 'x@test.local' }), {
      params: Promise.resolve({ id: FX.members.clergyAId }),
    });
    expect(res.status).toBe(403);
  });

  it('staff can still update fields beyond the self-service whitelist', async () => {
    const staffUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staffUser);

    const res = await memberPATCH(
      patchRequest({ workNotes: 'Updated by staff' }),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.member.workNotes).toBe('Updated by staff');
  });

  it('communication opt-out persists and defaults to opted-in', async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const initial = await commPrefsGET();
    const initialData = await initial.json();
    expect(initial.status).toBe(200);
    expect(initialData.preferences).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', optedOut: false },
        { channel: 'SMS', optedOut: false },
      ]),
    );

    const put = await commPrefsPUT(
      new Request('http://test/api/self-service/communication-preferences', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: [{ channel: 'SMS', optedOut: true }],
        }),
      }),
    );
    expect(put.status).toBe(200);

    const after = await commPrefsGET();
    const afterData = await after.json();
    expect(afterData.preferences).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', optedOut: false },
        { channel: 'SMS', optedOut: true },
      ]),
    );

    // Persisted row + audit entry.
    const row = await testDb.communicationPreference.findUnique({
      where: {
        memberId_channel: {
          memberId: FX.members.aliceSmithId,
          channel: 'SMS',
        },
      },
    });
    expect(row?.optedOut).toBe(true);

    const audit = await testDb.auditEntry.findFirst({
      where: {
        action: 'communications.preference.update',
        actorUserId: memberUser.id,
        outcome: AuditOutcome.SUCCESS,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects invalid channels and malformed bodies', async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const badChannel = await commPrefsPUT(
      new Request('http://test/x', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: [{ channel: 'CARRIER_PIGEON', optedOut: true }],
        }),
      }),
    );
    expect(badChannel.status).toBe(400);

    const emptyBody = await commPrefsPUT(
      new Request('http://test/x', {
        method: 'PUT',
        body: JSON.stringify({ preferences: [] }),
      }),
    );
    expect(emptyBody.status).toBe(400);
  });
});
