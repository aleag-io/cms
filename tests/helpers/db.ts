/**
 * Test DB helpers.
 *
 * Integration tests use the database pointed at by TEST_DATABASE_URL (falls
 * back to DATABASE_URL if not set).  resetTestDb() truncates all tables in
 * dependency order then re-seeds with the deterministic fixture data.
 */

import { PrismaClient, Role } from '@prisma/client';
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
  // Truncate in reverse FK order.
  await testDb.$transaction([
    testDb.auditEntry.deleteMany(),
    testDb.member.deleteMany(),
    testDb.family.deleteMany(),
    testDb.appUser.deleteMany(),
    testDb.parish.deleteMany(),
    testDb.diocese.deleteMany(),
  ]);

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
  },
  families: {
    smithId: '00000000-0000-0000-0000-000000000200',
  },
} as const;

async function seedFixtures() {
  const { dioceseId, parishAId, parishBId, users, families } = FX;

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
      },
      {
        id: parishBId,
        dioceseId,
        name: 'St. Mary Parish (Parish B)',
        address: 'Houston, TX',
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
        parishId: parishAId,
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
    ],
  });

  await testDb.family.create({
    data: {
      id: families.smithId,
      dioceseId,
      parishId: parishAId,
      familyNumber: '100',
      familyName: 'Smith',
      primaryContactEmail: 'smith@test.local',
    },
  });
}
