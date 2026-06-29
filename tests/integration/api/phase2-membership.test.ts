import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser } from '../../helpers/auth';
import { FX, testDb } from '../../helpers/db';

type RouteWithParams = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

let relationshipsGET: RouteWithParams;
let relationshipsPOST: RouteWithParams;
let parishesPOST: RouteWithParams;
let parishesPATCH: RouteWithParams;

async function loadRoutes() {
  ({ GET: relationshipsGET, POST: relationshipsPOST } = await import(
    '@/app/api/members/[id]/relationships/route'
  ));
  ({ POST: parishesPOST, PATCH: parishesPATCH } = await import(
    '@/app/api/members/[id]/parishes/route'
  ));
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) =>
  new Request('http://localhost', { method, body: JSON.stringify(body) });

describe('Phase 2 membership endpoints', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await loadRoutes();
  });

  afterEach(() => resetAuth?.());

  it('MM-13: staff creates and lists an extended family relationship', async () => {
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const createRes = await relationshipsPOST(
      json('POST', {
        relatedMemberId: FX.members.clergyAId,
        relationshipType: 'SIBLING',
      }),
      ctx(FX.members.aliceSmithId),
    );
    const created = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(created.ok).toBe(true);
    expect(created.relationship.relatedMemberId).toBe(FX.members.clergyAId);

    const listRes = await relationshipsGET(
      new Request('http://localhost'),
      ctx(FX.members.aliceSmithId),
    );
    const list = await listRes.json();
    expect(list.relationships.length).toBeGreaterThan(0);
  });

  it('MM-13: rejects a relationship to a member outside the parish', async () => {
    const staff = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAStaff.id },
    });
    resetAuth = asUser(staff);

    const res = await relationshipsPOST(
      json('POST', {
        relatedMemberId: FX.members.bobJonesBId, // Parish B member
        relationshipType: 'OTHER',
      }),
      ctx(FX.members.aliceSmithId),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it('MM-17: records a membership in the actor parish (own-parish only)', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    // A Parish-A member without a MemberParish row yet.
    const fresh = await testDb.member.create({
      data: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        memberIdentifier: '100.9',
        firstName: 'Fresh',
        lastName: 'Member',
        status: 'ACTIVE',
      },
    });

    const addRes = await parishesPOST(
      json('POST', {}),
      ctx(fresh.id),
    );
    const added = await addRes.json();
    expect(addRes.status).toBe(200);
    expect(added.ok).toBe(true);
    expect(added.membership.parishId).toBe(FX.parishAId);
  });

  it('MM-17: atomically switches a member primary parish across parishes', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    // Seed a second (Parish-B) membership directly — cross-parish enrolment is a
    // privileged/Phase-4 path, but the primary flip among existing memberships
    // is the Phase-2 operation under test.
    await testDb.memberParish.create({
      data: {
        memberId: FX.members.aliceSmithId,
        parishId: FX.parishBId,
        isPrimary: false,
        membershipType: 'SECONDARY',
      },
    });

    const patchRes = await parishesPATCH(
      json('PATCH', { primaryParishId: FX.parishBId }),
      ctx(FX.members.aliceSmithId),
    );
    expect((await patchRes.json()).ok).toBe(true);

    // Exactly one primary, now Parish B; Member.parishId synced.
    const memberships = await testDb.memberParish.findMany({
      where: { memberId: FX.members.aliceSmithId },
    });
    const primaries = memberships.filter((m) => m.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].parishId).toBe(FX.parishBId);

    const member = await testDb.member.findUniqueOrThrow({
      where: { id: FX.members.aliceSmithId },
    });
    expect(member.parishId).toBe(FX.parishBId);
  });
});
