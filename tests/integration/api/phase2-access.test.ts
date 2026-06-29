import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asGuest, asUser } from '../../helpers/auth';
import { FX, testDb } from '../../helpers/db';

let membersGET: () => Promise<Response>;
let exportGET: () => Promise<Response>;
let directoryGET: () => Promise<Response>;
let privateNoteGET: (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
let privateNotePATCH: (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
let overridesPUT: (request: Request) => Promise<Response>;

async function loadRoutes() {
  ({ GET: membersGET } = await import('@/app/api/members/route'));
  ({ GET: exportGET } = await import('@/app/api/members/export/route'));
  ({ GET: directoryGET } = await import('@/app/api/parish/directory/route'));
  ({ GET: privateNoteGET, PATCH: privateNotePATCH } =
    await import('@/app/api/members/[id]/private-note/route'));
  ({ PUT: overridesPUT } =
    await import('@/app/api/permissions/overrides/route'));
}

describe('Phase 2 access controls', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoutes();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('member-facing list and directory do not leak sensitive fields', async () => {
    const memberUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(memberUser);

    const membersRes = await membersGET();
    const membersData = await membersRes.json();
    expect(membersRes.status).toBe(200);
    expect(membersData.members.length).toBeGreaterThan(0);
    expect(membersData.members[0]).not.toHaveProperty('workNotes');
    expect(membersData.members[0]).not.toHaveProperty('privateNote');
    expect(membersData.members[0]).not.toHaveProperty('pastoralData');

    const directoryRes = await directoryGET();
    const directoryData = await directoryRes.json();
    expect(directoryRes.status).toBe(200);
    expect(directoryData.members[0]).not.toHaveProperty('dateOfBirth');
    expect(directoryData.members[0]).not.toHaveProperty('privateNote');
  });

  it('staff export excludes sensitive fields', async () => {
    const staffUser = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staffUser);

    const res = await exportGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.members.length).toBeGreaterThan(0);
    expect(data.members[0]).not.toHaveProperty('workNotes');
    expect(data.members[0]).not.toHaveProperty('privateNote');
    expect(data.members[0]).not.toHaveProperty('pastoralData');
    expect(data.members[0]).not.toHaveProperty('dateOfBirth');
  });

  it('clergy can read/write private notes and staff cannot', async () => {
    const clergy = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.clergyA.id },
    });
    resetAuth = asUser(clergy);

    const getRes = await privateNoteGET(new Request('http://localhost'), {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    const getData = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getData.privateNote).toMatch(/Private clergy note/i);

    const patchRes = await privateNotePATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Updated by clergy' }),
      }),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    expect(patchRes.status).toBe(200);

    resetAuth();
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);
    const deniedRes = await privateNoteGET(new Request('http://localhost'), {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    expect(deniedRes.status).toBe(403);
  });

  it('override writes are audited and escalation guard blocks unsafe grants', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const denied = await overridesPUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'MEMBER',
          resource: 'MEMBER_PRIVATE_NOTE',
          action: 'READ',
          isAllowed: true,
        }),
      }),
    );
    expect(denied.status).toBe(403);

    const allowed = await overridesPUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'MEMBER',
          resource: 'PARISH_DIRECTORY',
          action: 'READ',
          isAllowed: true,
        }),
      }),
    );
    expect(allowed.status).toBe(200);

    const audit = await testDb.auditEntry.findFirst({
      where: { action: 'access.permission.override' },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('returns 401 for unauthenticated directory access', async () => {
    resetAuth = asGuest();
    const res = await directoryGET();
    expect(res.status).toBe(401);
  });
});
