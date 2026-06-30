/**
 * @phase:3 @rls
 *
 * PA-16 — exclusive-membership constraint (Phase 3 exit gate item 1).
 *
 * Proven at the DATABASE layer: adding a member to a second ACTIVE exclusive
 * organization of the same type in the same parish is rejected by the partial
 * unique index `org_membership_exclusive_active` — not by application code.
 * OPEN mode allows many; ending the first membership frees the slot.
 *
 * Uses the privileged test client to insert directly so the failure is
 * unambiguously the DB constraint (the denormalize trigger copies type/mode
 * from the parent org, so the index cannot be evaded from the client).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MembershipMode, OrganizationType } from '@prisma/client';
import { resetTestDb, FX, testDb } from '../helpers/db';

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});

async function makeOrg(
  name: string,
  type: OrganizationType,
  mode: MembershipMode,
) {
  return testDb.organization.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name,
      organizationType: type,
      membershipMode: mode,
    },
  });
}

function addMembership(organizationId: string, memberId: string) {
  return testDb.organizationMembership.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      organizationId,
      memberId,
      // These are overwritten by the org_membership_denormalize trigger.
      organizationType: OrganizationType.OTHER,
      membershipMode: MembershipMode.OPEN,
    },
  });
}

describe('PA-16 exclusive membership (DB constraint)', () => {
  it('rejects a second active exclusive membership of the same type/parish', async () => {
    const org1 = await makeOrg(
      'Prayer Group Alpha',
      OrganizationType.PRAYER_GROUP,
      MembershipMode.EXCLUSIVE,
    );
    const org2 = await makeOrg(
      'Prayer Group Beta',
      OrganizationType.PRAYER_GROUP,
      MembershipMode.EXCLUSIVE,
    );

    const first = await addMembership(org1.id, FX.members.aliceSmithId);
    // Trigger denormalized the parent's type/mode onto the row.
    expect(first.organizationType).toBe(OrganizationType.PRAYER_GROUP);
    expect(first.membershipMode).toBe(MembershipMode.EXCLUSIVE);

    await expect(
      addMembership(org2.id, FX.members.aliceSmithId),
    ).rejects.toThrow();
  });

  it('allows many memberships in OPEN-mode organizations of the same type', async () => {
    const org1 = await makeOrg(
      'Committee One',
      OrganizationType.COMMITTEE,
      MembershipMode.OPEN,
    );
    const org2 = await makeOrg(
      'Committee Two',
      OrganizationType.COMMITTEE,
      MembershipMode.OPEN,
    );

    await addMembership(org1.id, FX.members.clergyAId);
    await expect(
      addMembership(org2.id, FX.members.clergyAId),
    ).resolves.toBeTruthy();
  });

  it('frees the slot once the first membership is ended (leftAt set)', async () => {
    await resetTestDb();
    const org1 = await makeOrg(
      'Sodality A',
      OrganizationType.PRAYER_GROUP,
      MembershipMode.EXCLUSIVE,
    );
    const org2 = await makeOrg(
      'Sodality B',
      OrganizationType.PRAYER_GROUP,
      MembershipMode.EXCLUSIVE,
    );

    const first = await addMembership(org1.id, FX.members.aliceSmithId);

    // Blocked while the first is active.
    await expect(
      addMembership(org2.id, FX.members.aliceSmithId),
    ).rejects.toThrow();

    // End the first membership — the partial index ignores leftAt IS NOT NULL.
    await testDb.organizationMembership.update({
      where: { id: first.id },
      data: { leftAt: new Date() },
    });

    await expect(
      addMembership(org2.id, FX.members.aliceSmithId),
    ).resolves.toBeTruthy();
  });
});
