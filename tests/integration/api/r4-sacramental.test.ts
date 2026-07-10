/**
 * Integration: sacramental register CRUD, dual-write pastoral dates, audit, access.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';

let listPost: typeof import('@/app/api/members/[id]/sacramental-records/route');
let recordMut: typeof import('@/app/api/members/[id]/sacramental-records/[recordId]/route');
let registerGet: typeof import('@/app/api/sacramental-records/route');

async function loadRoutes() {
  listPost = await import('@/app/api/members/[id]/sacramental-records/route');
  recordMut = await import(
    '@/app/api/members/[id]/sacramental-records/[recordId]/route'
  );
  registerGet = await import('@/app/api/sacramental-records/route');
}

describe('R4 sacramental API', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
    await loadRoutes();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('parish admin creates baptism, dual-writes pastoral date, and audits', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const req = new Request(
      `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sacramentType: 'BAPTISM',
          occurredOn: '2001-06-15',
          officiantName: 'Fr. Test',
          sponsorNames: 'John & Jane',
        }),
      },
    );

    const res = await listPost.POST(req, {
      params: Promise.resolve({ id: FX.members.aliceSmithId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.record.sacramentType).toBe('BAPTISM');

    const pastoral = await testDb.memberPastoralData.findUnique({
      where: { memberId: FX.members.aliceSmithId },
    });
    expect(pastoral?.baptismDate?.toISOString().slice(0, 10)).toBe('2001-06-15');

    const audit = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.sacramental_record.create',
        entityId: data.record.id,
      },
    });
    expect(audit?.outcome).toBe('SUCCESS');
  });

  it('staff cannot create sacramental records by default', async () => {
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const res = await listPost.POST(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sacramentType: 'BAPTISM',
            occurredOn: '2002-01-01',
          }),
        },
      ),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );

    expect(res.status).toBe(403);

    const denied = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.sacramental_record.create',
        outcome: 'DENIED',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(denied).not.toBeNull();
  });

  it('member lists only own records (empty for peer if none)', async () => {
    await testDb.sacramentalRecord.create({
      data: {
        parishId: FX.parishAId,
        memberId: FX.members.clergyAId,
        sacramentType: 'ORDINATION',
        occurredOn: new Date('1990-01-01'),
      },
    });

    const member = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(member);

    const peerRes = await listPost.GET(
      new Request(
        `http://localhost/api/members/${FX.members.clergyAId}/sacramental-records`,
      ),
      { params: Promise.resolve({ id: FX.members.clergyAId }) },
    );
    const peerData = await peerRes.json();
    expect(peerRes.status).toBe(200);
    expect(peerData.records).toHaveLength(0);

    await testDb.sacramentalRecord.create({
      data: {
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        sacramentType: 'BAPTISM',
        occurredOn: new Date('2000-01-01'),
      },
    });

    const ownRes = await listPost.GET(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records`,
      ),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    const ownData = await ownRes.json();
    expect(ownData.records).toHaveLength(1);
  });

  it('soft-deactivates via DELETE and writes audit', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const created = await testDb.sacramentalRecord.create({
      data: {
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        sacramentType: 'HOLY_COMMUNION',
        occurredOn: new Date('2010-05-01'),
      },
    });

    const res = await recordMut.DELETE(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records/${created.id}`,
      ),
      {
        params: Promise.resolve({
          id: FX.members.aliceSmithId,
          recordId: created.id,
        }),
      },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.record.isActive).toBe(false);

    const audit = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.sacramental_record.deactivate',
        entityId: created.id,
      },
    });
    expect(audit?.outcome).toBe('SUCCESS');
  });

  it('staff with PA-12 overrides can create records end-to-end (incl. dual-write)', async () => {
    // Register write + the pastoral read/write the baptism dual-write needs.
    await testDb.parishPermissionOverride.createMany({
      data: (
        [
          ['MEMBER_SACRAMENTAL_RECORD', 'READ'],
          ['MEMBER_SACRAMENTAL_RECORD', 'WRITE'],
          ['MEMBER_PASTORAL_DATA', 'READ'],
          ['MEMBER_PASTORAL_DATA', 'WRITE'],
        ] as const
      ).map(([resource, action]) => ({
        parishId: FX.parishAId,
        role: 'PARISH_STAFF' as const,
        resource,
        action,
        isAllowed: true,
        grantedByUserId: FX.users.parishAAdmin.id,
      })),
    });

    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const res = await listPost.POST(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sacramentType: 'BAPTISM',
            occurredOn: '2003-03-03',
          }),
        },
      ),
      { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.record.sacramentType).toBe('BAPTISM');

    const pastoral = await testDb.memberPastoralData.findUnique({
      where: { memberId: FX.members.aliceSmithId },
    });
    expect(pastoral?.baptismDate?.toISOString().slice(0, 10)).toBe('2003-03-03');
  });

  it('rejects a spouseMemberId that is not a member of the parish', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const post = (spouseMemberId: string) =>
      listPost.POST(
        new Request(
          `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sacramentType: 'MARRIAGE',
              occurredOn: '2020-06-20',
              spouseMemberId,
            }),
          },
        ),
        { params: Promise.resolve({ id: FX.members.aliceSmithId }) },
      );

    expect((await post('not-a-uuid')).status).toBe(400);
    // Parish B member is invisible / out of scope for Parish A registers.
    expect((await post(FX.members.bobJonesBId)).status).toBe(400);
  });

  it('privileged record read is audited; members cannot read own inactive records', async () => {
    const inactive = await testDb.sacramentalRecord.create({
      data: {
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        sacramentType: 'BAPTISM',
        occurredOn: new Date('2000-01-01'),
        isActive: false,
      },
    });

    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    const adminRes = await recordMut.GET(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records/${inactive.id}`,
      ),
      {
        params: Promise.resolve({
          id: FX.members.aliceSmithId,
          recordId: inactive.id,
        }),
      },
    );
    expect(adminRes.status).toBe(200);

    const readAudit = await testDb.auditEntry.findFirst({
      where: {
        action: 'membership.sacramental_record.read',
        entityId: inactive.id,
      },
    });
    expect(readAudit?.outcome).toBe('SUCCESS');

    resetAuth();
    const member = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(member);

    const memberRes = await recordMut.GET(
      new Request(
        `http://localhost/api/members/${FX.members.aliceSmithId}/sacramental-records/${inactive.id}`,
      ),
      {
        params: Promise.resolve({
          id: FX.members.aliceSmithId,
          recordId: inactive.id,
        }),
      },
    );
    expect(memberRes.status).toBe(404);
  });

  it('parish register search returns matching rows for admin', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    await testDb.sacramentalRecord.create({
      data: {
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        sacramentType: 'CONFIRMATION',
        occurredOn: new Date('2012-04-08'),
        officiantName: 'Bishop Test',
      },
    });

    const res = await registerGet.GET(
      new Request(
        'http://localhost/api/sacramental-records?q=Alice&type=CONFIRMATION',
      ),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.records.length).toBeGreaterThanOrEqual(1);
    expect(data.records[0].member.firstName).toBe('Alice');
  });
});
