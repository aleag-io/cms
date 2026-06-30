/**
 * @phase:1 @rls
 *
 * Cross-tenant RLS tests — Phase 1 exit gate.
 *
 * These tests prove at the DATABASE layer (not the application layer) that:
 *   1. A Parish-A user cannot read or write Parish-B rows in any table.
 *   2. A Diocese-level user sees Tier-1 structural data (parishes) but
 *      ZERO raw member or family rows (SE-3).
 *   3. AuditEntry cannot be updated or deleted by any user (AU-10).
 *   4. Cross-parish INSERT is rejected by WITH CHECK.
 *
 * Each test opens a real pg.PoolClient as app_authenticated with claims set
 * via set_config('request.jwt.claims', ...). This is the authoritative path —
 * it is completely independent of Next.js, Prisma, and route handlers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetTestDb, FX, testDb } from '../helpers/db';
import { withTenantSession, makeClaims, closeRlsPool } from '../helpers/rls';

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeRlsPool();
  await testDb.$disconnect();
});

// ─── Claims fixtures ──────────────────────────────────────────────────────────

const parishAAdminClaims = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});

const parishAStaffClaims = makeClaims({
  userId: FX.users.parishAStaff.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_staff',
});

const parishAMemberClaims = makeClaims({
  userId: FX.users.parishAMember.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'member',
  memberId: FX.members.aliceSmithId,
});

const clergyAClaims = makeClaims({
  userId: FX.users.clergyA.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_staff',
  memberId: FX.members.clergyAId,
  clergyParishIds: [FX.parishAId],
});

const pastoralAccessorClaims = makeClaims({
  userId: FX.users.pastoralAccessorA.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'pastoral_data_accessor',
});

const parishBAdminClaims = makeClaims({
  userId: FX.users.parishBAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishBId,
  role: 'parish_admin',
});

const dioceseAdminClaims = makeClaims({
  userId: FX.users.dioceseAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: null,
  role: 'diocese_admin',
});

// ─── 1. Member isolation ──────────────────────────────────────────────────────

describe('Member — cross-tenant isolation', () => {
  it('Parish-A admin sees Parish-A members', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "Member" WHERE "parishId" = $1`, [
        FX.parishAId,
      ]),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('Parish-A admin sees ZERO Parish-B members', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "Member" WHERE "parishId" = $1`, [
        FX.parishBId,
      ]),
    );
    expect(rows).toHaveLength(0);
  });

  it('Parish-A admin sees ZERO members when no parishId filter applied (RLS gates table)', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id, "parishId" FROM "Member"`),
    );
    // RLS should restrict all returned rows to parishAId only
    const crossRows = rows.filter((r) => r.parishId !== FX.parishAId);
    expect(crossRows).toHaveLength(0);
  });

  it('Diocese admin sees ZERO raw member rows (SE-3)', async () => {
    const { rows } = await withTenantSession(dioceseAdminClaims, (client) =>
      client.query(`SELECT id FROM "Member"`),
    );
    expect(rows).toHaveLength(0);
  });

  it('Parish-B admin sees ZERO Parish-A members', async () => {
    const { rows } = await withTenantSession(parishBAdminClaims, (client) =>
      client.query(`SELECT id FROM "Member" WHERE "parishId" = $1`, [
        FX.parishAId,
      ]),
    );
    expect(rows).toHaveLength(0);
  });

  it('Member role cannot read all Member rows directly', async () => {
    const { rows } = await withTenantSession(parishAMemberClaims, (client) =>
      client.query(`SELECT id FROM "Member"`),
    );
    // Self-read policy may return one row when userId is linked, but never all parish rows.
    expect(rows.length).toBeLessThan(2);
  });
});

describe('Phase 2 sensitive field RLS', () => {
  it('Parish staff cannot read private notes', async () => {
    const { rows } = await withTenantSession(parishAStaffClaims, (client) =>
      client.query(`SELECT id FROM "MemberPrivateNote"`),
    );
    expect(rows).toHaveLength(0);
  });

  it('Clergy can read private notes only for assigned clergy parish', async () => {
    const { rows } = await withTenantSession(clergyAClaims, (client) =>
      client.query(
        `SELECT "parishId" FROM "MemberPrivateNote" ORDER BY "parishId"`,
      ),
    );

    expect(rows.length).toBeGreaterThan(0);
    const parishIds = new Set(rows.map((r) => r.parishId));
    expect(parishIds.has(FX.parishAId)).toBe(true);
    expect(parishIds.has(FX.parishBId)).toBe(false);
  });

  it('Parish admin cannot read private notes without clergy assignment', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "MemberPrivateNote"`),
    );
    expect(rows).toHaveLength(0);
  });

  it('Pastoral accessor can read pastoral data in own parish', async () => {
    const { rows } = await withTenantSession(pastoralAccessorClaims, (client) =>
      client.query(`SELECT id FROM "MemberPastoralData"`),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('Member role cannot read pastoral data', async () => {
    const { rows } = await withTenantSession(parishAMemberClaims, (client) =>
      client.query(`SELECT id FROM "MemberPastoralData"`),
    );
    expect(rows).toHaveLength(0);
  });

  it('Directory view excludes private notes and DOB columns', async () => {
    await withTenantSession(parishAMemberClaims, (client) =>
      client.query(
        `SELECT "dateOfBirth", note FROM parish_member_directory LIMIT 1`,
      ),
    ).then(
      () => {
        throw new Error(
          'Expected selecting sensitive columns from directory view to fail',
        );
      },
      () => {
        expect(true).toBe(true);
      },
    );
  });

  it('Member sees same-parish peers via directory (MM-14), not just self', async () => {
    const { rows } = await withTenantSession(parishAMemberClaims, (client) =>
      client.query(`SELECT id, "parishId" FROM parish_member_directory`),
    );
    // More than the member's own row — the whole point of the directory.
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.parishId === FX.parishAId)).toBe(true);
  });

  it('Member directory shows ZERO other-parish members (MM-14 isolation)', async () => {
    const { rows } = await withTenantSession(parishAMemberClaims, (client) =>
      client.query(
        `SELECT id FROM parish_member_directory WHERE "parishId" = $1`,
        [FX.parishBId],
      ),
    );
    expect(rows).toHaveLength(0);
  });
});

// ─── 2. Family isolation ──────────────────────────────────────────────────────

describe('Family — cross-tenant isolation', () => {
  it('Parish-A admin sees Parish-A families', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "Family" WHERE "parishId" = $1`, [
        FX.parishAId,
      ]),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('Parish-A admin sees ZERO Parish-B families', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "Family" WHERE "parishId" = $1`, [
        FX.parishBId,
      ]),
    );
    expect(rows).toHaveLength(0);
  });

  it('Diocese admin sees ZERO raw family rows (SE-3)', async () => {
    const { rows } = await withTenantSession(dioceseAdminClaims, (client) =>
      client.query(`SELECT id FROM "Family"`),
    );
    expect(rows).toHaveLength(0);
  });
});

// ─── 3. Cross-parish INSERT blocked by WITH CHECK ──────────────────────────────

describe('Member — cross-tenant write blocked (WITH CHECK)', () => {
  it('Parish-A admin cannot INSERT a member into Parish-B', async () => {
    await expect(
      withTenantSession(parishAAdminClaims, (client) =>
        client.query(
          `INSERT INTO "Member" ("id","dioceseId","parishId","memberIdentifier","firstName","lastName","status","createdAt","updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'XTEST.1', 'Cross', 'Parish', 'ACTIVE', now(), now())`,
          [FX.dioceseId, FX.parishBId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('Parish-A admin cannot INSERT a family into Parish-B', async () => {
    await expect(
      withTenantSession(parishAAdminClaims, (client) =>
        client.query(
          `INSERT INTO "Family" ("id","dioceseId","parishId","familyNumber","familyName","registrationDate","isActive","createdAt","updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'X999', 'CrossParish', now(), true, now(), now())`,
          [FX.dioceseId, FX.parishBId],
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── 4. Parish isolation (Tier-1 structural) ──────────────────────────────────

describe('Parish — diocese structural read (Tier-1)', () => {
  it('Diocese admin sees parishes in their diocese', async () => {
    const { rows } = await withTenantSession(dioceseAdminClaims, (client) =>
      client.query(`SELECT id FROM "Parish" WHERE "dioceseId" = $1`, [
        FX.dioceseId,
      ]),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('Parish-A admin can read their own parish profile', async () => {
    const { rows } = await withTenantSession(parishAAdminClaims, (client) =>
      client.query(`SELECT id FROM "Parish" WHERE id = $1`, [FX.parishAId]),
    );
    expect(rows).toHaveLength(1);
  });
});

// ─── 5. AuditEntry immutability (AU-10) ──────────────────────────────────────

describe('AuditEntry — append-only (AU-10)', () => {
  it('UPDATE on AuditEntry is rejected (trigger or grant)', async () => {
    // Seed one audit row first via privileged path.
    const { id: auditId } = await testDb.auditEntry.create({
      data: {
        requestId: 'test-immutability',
        actorType: 'HUMAN',
        actorLabel: 'test',
        action: 'test.audit.create',
        entityType: 'test',
        outcome: 'SUCCESS',
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
      },
    });

    // Either the REVOKE (permission denied) or the trigger (immutable) fires.
    // Both prove the operation is blocked at the DB layer — AU-10 satisfied.
    await expect(
      withTenantSession(parishAAdminClaims, (client) =>
        client.query(
          `UPDATE "AuditEntry" SET "actorLabel" = 'tampered' WHERE id = $1`,
          [auditId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('DELETE on AuditEntry is rejected (trigger or grant)', async () => {
    const { id: auditId } = await testDb.auditEntry.create({
      data: {
        requestId: 'test-immutability-delete',
        actorType: 'HUMAN',
        actorLabel: 'test',
        action: 'test.audit.delete',
        entityType: 'test',
        outcome: 'SUCCESS',
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
      },
    });

    await expect(
      withTenantSession(parishAAdminClaims, (client) =>
        client.query(`DELETE FROM "AuditEntry" WHERE id = $1`, [auditId]),
      ),
    ).rejects.toThrow();
  });
});

// ─── 6. Policy schema assertions ──────────────────────────────────────────────

describe('Policy schema — RLS enabled+forced on all tenant tables', () => {
  const tenantTables = [
    'Diocese',
    'Parish',
    'AppUser',
    'Family',
    'Member',
    'AuditEntry',
    'ParishOfficer',
    'MemberPrivateNote',
    'MemberPastoralData',
    'FamilyPastoralData',
    'MemberRelationship',
    'MemberParish',
    'ParishPermissionOverride',
    // Phase 3
    'Program',
    'ProgramEnrollment',
    'ProgramSession',
    'ProgramSessionAttendance',
    'Organization',
    'OrganizationMembership',
    'OrganizationOfficer',
    'Event',
    'EventAttendance',
    'Facility',
    'FacilityBooking',
    'Message',
    'MessageRecipient',
    'MessageTemplate',
    'CommunicationPreference',
    'VolunteerAssignment',
    'MemberRegistration',
  ];

  for (const table of tenantTables) {
    it(`"${table}" has RLS enabled and forced`, async () => {
      // Check via pg_class — does not need app_authenticated.
      // $queryRaw returns the array of rows directly (not wrapped in { rows }).
      const rows = await testDb.$queryRaw<
        { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = ${table}
          AND relkind = 'r'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });
  }
});
