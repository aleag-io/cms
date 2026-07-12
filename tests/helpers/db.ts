/**
 * Test DB helpers.
 *
 * Integration tests use the database pointed at by TEST_DATABASE_URL (falls
 * back to DATABASE_URL if not set).  resetTestDb() truncates all tables in
 * dependency order then re-seeds with the deterministic fixture data.
 */

import { OfficerType, PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Use a dedicated client for the test DB so it is independent of the
// application singleton in lib/prisma.ts.
const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
});
const testDb = new PrismaClient({ adapter: new PrismaPg(testPool) });

export { testDb };

/** Delete all rows in reverse dependency order, then re-seed. */
export async function resetTestDb() {
  // TRUNCATE bypasses row-level triggers (including the AuditEntry
  // immutability trigger) and is faster than DELETE for bulk cleanup.
  // CASCADE handles FK dependencies in one shot.
  await testDb.$executeRawUnsafe(
    `TRUNCATE "StripeEvent", "GivingStatement", "BankStatementLine", "ReconciliationRun", "BudgetLine", "Budget", "Payment", "VendorBill", "Vendor", "Pledge", "DonationAllocation", "Donation", "DonationBatch", "GivingCategory", "Campaign", "ExternalDonor", "ApprovalDecision", "ApprovalRequest", "ApprovalPolicy", "JournalLine", "JournalEntry", "AccountingPeriod", "Account", "Fund", "AuditEntry", "ContextualShare", "EmergencyAccessGrant", "DataSharingGrant", "DataSharingRequest", "MemberRegistration", "VolunteerAssignment", "CommunicationPreference", "MessageTemplate", "MessageRecipient", "Message", "FacilityBooking", "Facility", "EventAttendance", "Event", "OrganizationOfficer", "OrganizationMembership", "Organization", "ProgramSessionAttendance", "ProgramSession", "ProgramEnrollment", "Program", "ParishPermissionOverride", "MemberRelationship", "SacramentalRecord", "LiturgicalObservance", "FamilyPastoralData", "MemberPastoralData", "MemberPrivateNote", "ParishOfficer", "MemberParish", "Member", "Family", "AppUser", "Parish", "Diocese" CASCADE`,
  );

  await seedFixtures();
}

/** The single exported fixture dataset — reference these IDs in tests. */
export const FX = {
  dioceseId: '00000000-0000-0000-0000-000000000001',
  parishAId: '00000000-0000-0000-0000-000000000010',
  parishBId: '00000000-0000-0000-0000-000000000011',
  users: {
    dioceseAdmin: {
      id: '00000000-0000-0000-0000-000000000100',
      email: 'diocese-admin@test.local',
    },
    parishAAdmin: {
      id: '00000000-0000-0000-0000-000000000101',
      email: 'parish-a-admin@test.local',
    },
    parishBAdmin: {
      id: '00000000-0000-0000-0000-000000000102',
      email: 'parish-b-admin@test.local',
    },
    parishAStaff: {
      id: '00000000-0000-0000-0000-000000000103',
      email: 'parish-a-staff@test.local',
    },
    parishAMember: {
      id: '00000000-0000-0000-0000-000000000104',
      email: 'parish-a-member@test.local',
    },
    clergyA: {
      id: '00000000-0000-0000-0000-000000000105',
      email: 'clergy-a@test.local',
    },
    pastoralAccessorA: {
      id: '00000000-0000-0000-0000-000000000106',
      email: 'pastoral-accessor-a@test.local',
    },
  },
  families: {
    smithId: '00000000-0000-0000-0000-000000000200',
    jonesBId: '00000000-0000-0000-0000-000000000201',
  },
  members: {
    aliceSmithId: '00000000-0000-0000-0000-000000000300',
    clergyAId: '00000000-0000-0000-0000-000000000301',
    bobJonesBId: '00000000-0000-0000-0000-000000000302',
  },
} as const;

async function seedFixtures() {
  const { dioceseId, parishAId, parishBId, users, families, members } = FX;

  await testDb.diocese.create({
    data: {
      id: dioceseId,
      name: 'Test Diocese of North America',
    },
  });

  await testDb.parish.createMany({
    data: [
      {
        id: parishAId,
        dioceseId,
        name: 'St. Thomas Parish (Parish A)',
        address: 'Dallas, TX',
        familyNumberPrefix: '',
        familyNumberWidth: 4,
        familyNumberStart: 1,
      },
      {
        id: parishBId,
        dioceseId,
        name: 'St. Mary Parish (Parish B)',
        address: 'Houston, TX',
        familyNumberPrefix: '',
        familyNumberWidth: 4,
        familyNumberStart: 1,
      },
    ],
  });

  await testDb.appUser.createMany({
    data: [
      {
        id: users.dioceseAdmin.id,
        email: users.dioceseAdmin.email,
        displayName: 'Diocese Admin',
        role: Role.DIOCESE_ADMIN,
        dioceseId,
        parishId: null, // Diocese-level — no parish scope
      },
      {
        id: users.parishAAdmin.id,
        email: users.parishAAdmin.email,
        displayName: 'Parish A Admin',
        role: Role.PARISH_ADMIN,
        dioceseId,
        parishId: parishAId,
      },
      {
        id: users.parishBAdmin.id,
        email: users.parishBAdmin.email,
        displayName: 'Parish B Admin',
        role: Role.PARISH_ADMIN,
        dioceseId,
        parishId: parishBId,
      },
      {
        id: users.parishAStaff.id,
        email: users.parishAStaff.email,
        displayName: 'Parish A Staff',
        role: Role.PARISH_STAFF,
        dioceseId,
        parishId: parishAId,
      },
      {
        id: users.parishAMember.id,
        email: users.parishAMember.email,
        displayName: 'Parish A Member',
        role: Role.MEMBER,
        dioceseId,
        parishId: parishAId,
      },
      {
        id: users.clergyA.id,
        email: users.clergyA.email,
        displayName: 'Clergy A',
        role: Role.PARISH_STAFF,
        dioceseId,
        parishId: parishAId,
      },
      {
        id: users.pastoralAccessorA.id,
        email: users.pastoralAccessorA.email,
        displayName: 'Pastoral Accessor A',
        role: Role.PASTORAL_DATA_ACCESSOR,
        dioceseId,
        parishId: parishAId,
      },
    ],
  });

  await testDb.family.createMany({
    data: [
      {
        id: families.smithId,
        dioceseId,
        parishId: parishAId,
        familyNumber: '100',
        familyName: 'Smith',
        primaryContactEmail: 'smith@test.local',
      },
      {
        id: families.jonesBId,
        dioceseId,
        parishId: parishBId,
        familyNumber: '0100',
        familyName: 'Jones',
        primaryContactEmail: 'jones@test.local',
      },
    ],
  });

  await testDb.member.create({
    data: {
      id: members.aliceSmithId,
      dioceseId,
      parishId: parishAId,
      familyId: families.smithId,
      userId: users.parishAMember.id,
      memberIdentifier: '100.1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@test.local',
      workNotes: 'Staff-only note',
      educationLevel: 'UNDERGRADUATE',
      skillsInterests: ['Choir'],
    },
  });

  await testDb.member.create({
    data: {
      id: members.clergyAId,
      dioceseId,
      parishId: parishAId,
      familyId: families.smithId,
      userId: users.clergyA.id,
      memberIdentifier: '100.2',
      firstName: 'Fr',
      lastName: 'Clergy',
      email: 'clergy@test.local',
    },
  });

  await testDb.member.create({
    data: {
      id: members.bobJonesBId,
      dioceseId,
      parishId: parishBId,
      familyId: families.jonesBId,
      memberIdentifier: '0100.1',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@test.local',
    },
  });

  await testDb.memberParish.createMany({
    data: [
      {
        memberId: members.aliceSmithId,
        parishId: parishAId,
        isPrimary: true,
        membershipType: 'PRIMARY',
      },
      {
        memberId: members.clergyAId,
        parishId: parishAId,
        isPrimary: true,
        membershipType: 'PRIMARY',
      },
      {
        memberId: members.clergyAId,
        parishId: parishBId,
        isPrimary: false,
        membershipType: 'SECONDARY',
      },
      {
        memberId: members.bobJonesBId,
        parishId: parishBId,
        isPrimary: true,
        membershipType: 'PRIMARY',
      },
    ],
  });

  await testDb.parishOfficer.create({
    data: {
      parishId: parishAId,
      memberId: members.clergyAId,
      title: 'Vicar',
      officerType: OfficerType.CLERGY,
      isActive: true,
    },
  });

  await testDb.memberPrivateNote.createMany({
    data: [
      {
        memberId: members.aliceSmithId,
        parishId: parishAId,
        note: 'Private clergy note for Alice',
      },
      {
        memberId: members.bobJonesBId,
        parishId: parishBId,
        note: 'Private clergy note for Bob in Parish B',
      },
    ],
  });

  await testDb.memberPastoralData.createMany({
    data: [
      {
        memberId: members.aliceSmithId,
        parishId: parishAId,
        dateOfBirth: new Date('1990-01-01'),
      },
      {
        memberId: members.bobJonesBId,
        parishId: parishBId,
        dateOfBirth: new Date('1991-02-02'),
      },
    ],
  });
}
