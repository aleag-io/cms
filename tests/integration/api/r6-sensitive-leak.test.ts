/**
 * R6 EXIT GATE — cross-cutting sensitive-field leak test.
 *
 * Poisons the fixture parish with uniquely-identifiable sensitive values, then
 * sweeps EVERY report/export/aggregate/webhook output for them. The sweep is
 * registry-driven: adding a report to lib/reports/registry.ts automatically
 * puts it under this gate with no test edit.
 *
 * PDF coverage is structural rather than byte-level: renderReportPdf consumes
 * only the ReportResult that this test already scans as JSON, and a unit test
 * (tests/unit/reports/render-csv.test.ts) asserts the renderer imports no
 * data-layer module — so nothing can reach the page that is not scanned here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role } from '@prisma/client';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import { REPORTS } from '@/lib/reports/registry';
import { closeRlsPool, makeClaims, withTenantSession } from '../../helpers/rls';

const SENTINELS = {
  workNotes: 'LEAK_WORK_NOTES_SENTINEL',
  privateNote: 'LEAK_PRIVATE_NOTE_SENTINEL',
  sacramentalNotes: 'LEAK_SACRAMENTAL_NOTES_SENTINEL',
  dedication: 'LEAK_DEDICATION_SENTINEL',
  skills: 'LEAK_SKILLS_SENTINEL',
  dateOfBirth: '1901-02-03',
  baptismDate: '1902-03-04',
  anniversary: '1903-04-05',
};

/** Sensitive values that must never appear in report/export/webhook output. */
const FORBIDDEN = Object.values(SENTINELS);

const IDS = {
  fund: '00000000-0000-0000-0000-0000000f0001',
  cash: '00000000-0000-0000-0000-0000000f0002',
  income: '00000000-0000-0000-0000-0000000f0003',
  expense: '00000000-0000-0000-0000-0000000f0004',
  period: '00000000-0000-0000-0000-0000000f0005',
  category: '00000000-0000-0000-0000-0000000f0006',
  campaign: '00000000-0000-0000-0000-0000000f0007',
  program: '00000000-0000-0000-0000-0000000f0008',
  session: '00000000-0000-0000-0000-0000000f0009',
  event: '00000000-0000-0000-0000-0000000f000a',
  budget: '00000000-0000-0000-0000-0000000f000b',
};

const YEAR = new Date().getUTCFullYear();

function expectNoSensitive(text: string, surface: string) {
  for (const sentinel of FORBIDDEN) {
    expect(
      text.includes(sentinel),
      `${surface} leaked sensitive value "${sentinel}"`,
    ).toBe(false);
  }
}

async function poisonFixtures() {
  await testDb.member.update({
    where: { id: FX.members.aliceSmithId },
    data: {
      workNotes: SENTINELS.workNotes,
      skillsInterests: [SENTINELS.skills],
    },
  });
  await testDb.memberPrivateNote.updateMany({
    where: { memberId: FX.members.aliceSmithId },
    data: { note: SENTINELS.privateNote },
  });
  await testDb.memberPastoralData.upsert({
    where: { memberId: FX.members.aliceSmithId },
    update: {
      dateOfBirth: new Date(SENTINELS.dateOfBirth),
      baptismDate: new Date(SENTINELS.baptismDate),
    },
    create: {
      memberId: FX.members.aliceSmithId,
      parishId: FX.parishAId,
      dateOfBirth: new Date(SENTINELS.dateOfBirth),
      baptismDate: new Date(SENTINELS.baptismDate),
      updatedAt: new Date(),
    },
  });
  await testDb.familyPastoralData.upsert({
    where: { familyId: FX.families.smithId },
    update: { anniversaryDate: new Date(SENTINELS.anniversary) },
    create: {
      familyId: FX.families.smithId,
      parishId: FX.parishAId,
      anniversaryDate: new Date(SENTINELS.anniversary),
      updatedAt: new Date(),
    },
  });
  await testDb.sacramentalRecord.create({
    data: {
      parishId: FX.parishAId,
      memberId: FX.members.aliceSmithId,
      sacramentType: 'BAPTISM',
      occurredOn: new Date(`${YEAR}-05-01`),
      notes: SENTINELS.sacramentalNotes,
      updatedAt: new Date(),
    },
  });

  // Finance surface: ledger, category, budget, donation with a dedication.
  await testDb.fund.create({
    data: {
      id: IDS.fund,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      name: 'General',
    },
  });
  await testDb.account.createMany({
    data: [
      { id: IDS.cash, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '1000', name: 'Cash', type: 'ASSET', fundId: IDS.fund },
      { id: IDS.income, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '4110', name: 'Subscription', type: 'INCOME', fundId: IDS.fund },
      { id: IDS.expense, dioceseId: FX.dioceseId, parishId: FX.parishAId, ownerType: 'PARISH', ownerId: FX.parishAId, code: '5000', name: 'Salaries', type: 'EXPENSE', fundId: IDS.fund, reportSection: 'Personnel' },
    ],
  });
  await testDb.accountingPeriod.create({
    data: {
      id: IDS.period,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      startDate: new Date(`${YEAR}-01-01`),
      endDate: new Date(`${YEAR}-12-31`),
      status: 'OPEN',
    },
  });
  await testDb.givingCategory.create({
    data: {
      id: IDS.category,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      name: 'Subscription',
      section: 'Church Operation',
      sortOrder: 1,
      fundId: IDS.fund,
      incomeAccountId: IDS.income,
      updatedAt: new Date(),
    },
  });
  await testDb.budget.create({
    data: {
      id: IDS.budget,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      ownerType: 'PARISH',
      ownerId: FX.parishAId,
      fiscalYear: YEAR,
      updatedAt: new Date(),
      lines: {
        create: [
          { accountId: IDS.income, originalCents: 500_000n, revisedCents: 500_000n },
          { accountId: IDS.expense, originalCents: 200_000n, revisedCents: 200_000n },
        ],
      },
    },
  });
  await testDb.donation.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      familyId: FX.families.smithId,
      memberId: FX.members.aliceSmithId,
      fundId: IDS.fund,
      categoryId: IDS.category,
      periodId: IDS.period,
      amountCents: 25_000n,
      method: 'CHECK',
      dedication: SENTINELS.dedication,
      receivedAt: new Date(`${YEAR}-03-15`),
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  });
  await testDb.campaign.create({
    data: {
      id: IDS.campaign,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Building',
      fundId: IDS.fund,
      accountId: IDS.income,
      goalCents: 1_000_000n,
      startDate: new Date(`${YEAR}-01-01`),
      endDate: new Date(`${YEAR}-12-31`),
      updatedAt: new Date(),
    },
  });
  await testDb.pledge.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      campaignId: IDS.campaign,
      familyId: FX.families.smithId,
      memberId: FX.members.aliceSmithId,
      amountCents: 100_000n,
      fulfilledCents: 25_000n,
      startDate: new Date(`${YEAR}-01-01`),
      updatedAt: new Date(),
    },
  });

  // Operations surface: program session attendance and an event.
  await testDb.program.create({
    data: {
      id: IDS.program,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Sunday School',
      programType: 'FAITH_FORMATION',
      updatedAt: new Date(),
    },
  });
  await testDb.programSession.create({
    data: {
      id: IDS.session,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      programId: IDS.program,
      title: 'Week 1',
      scheduledAt: new Date(`${YEAR}-02-01`),
      updatedAt: new Date(),
    },
  });
  await testDb.programSessionAttendance.create({
    data: {
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      sessionId: IDS.session,
      memberId: FX.members.aliceSmithId,
      status: 'PRESENT',
      updatedAt: new Date(),
    },
  });
  await testDb.event.create({
    data: {
      id: IDS.event,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Parish Feast',
      startAt: new Date(`${YEAR}-06-01T10:00:00Z`),
      endAt: new Date(`${YEAR}-06-01T12:00:00Z`),
      updatedAt: new Date(),
    },
  });
  // EventAttendance is intentionally not seeded here: a DB trigger requires
  // parish-staff claims to mark attendance, and the event row alone exercises
  // every event-shaped report surface this gate needs to scan.
}

const ROLE_TO_FIXTURE: Partial<Record<Role, keyof typeof FX.users>> = {
  [Role.GLOBAL_ADMIN]: 'dioceseAdmin',
  [Role.DIOCESE_ADMIN]: 'dioceseAdmin',
  [Role.DIOCESE_STAFF]: 'dioceseAdmin',
  [Role.DIOCESE_REPORT_VIEWER]: 'dioceseAdmin',
  [Role.PARISH_ADMIN]: 'parishAAdmin',
  [Role.PARISH_STAFF]: 'parishAStaff',
  [Role.CLERGY]: 'clergyA',
  [Role.PASTORAL_DATA_ACCESSOR]: 'pastoralAccessorA',
};

describe('R6 exit gate — sensitive-field leak sweep', () => {
  let reportRoute: typeof import('@/app/api/reports/[id]/route');
  let exportRoute: typeof import('@/app/api/members/export/route');
  let membersRoute: typeof import('@/app/api/members/route');

  beforeAll(async () => {
    await resetTestDb();
    await poisonFixtures();
    reportRoute = await import('@/app/api/reports/[id]/route');
    exportRoute = await import('@/app/api/members/export/route');
    membersRoute = await import('@/app/api/members/route');
  });

  afterAll(async () => {
    await closeRlsPool();
  });

  it('sweeps every registry report × permitted role × json and csv', async () => {
    let surfacesChecked = 0;

    for (const def of REPORTS) {
      for (const role of def.roles) {
        const fixtureKey = ROLE_TO_FIXTURE[role];
        if (!fixtureKey) continue; // no fixture user for this role
        const user = await testDb.appUser.findUnique({
          where: { id: FX.users[fixtureKey].id },
        });
        if (!user) continue;

        // Impersonate with the role under test, not the fixture's own role.
        const reset = asUser({ ...user, role });
        try {
          for (const format of ['json', 'csv'] as const) {
            const search = new URLSearchParams({ format });
            for (const param of def.params) {
              if (param.key === 'year') search.set('year', String(YEAR));
              else if (param.type === 'select' && param.options?.[0]) {
                search.set(param.key, param.options[0].value);
              }
            }
            if (def.needsLedgerOwner) search.set('owner', 'parish');

            const response = await reportRoute.GET(
              new Request(`http://localhost/api/reports/${def.id}?${search}`),
              { params: Promise.resolve({ id: def.id }) },
            );
            const text = await response.text();
            // 400/403 are legitimate (e.g. diocese report run as a parish
            // actor); only successful output can leak.
            if (response.status === 200) {
              expectNoSensitive(text, `${def.id} [${role}/${format}]`);
              surfacesChecked += 1;
            }
          }
        } finally {
          reset();
        }
      }
    }

    // Guard against the sweep silently checking nothing.
    expect(surfacesChecked).toBeGreaterThan(10);
  });

  it('member CSV export never leaks fields the role may not see', async () => {
    for (const [role, fixtureKey] of Object.entries(ROLE_TO_FIXTURE) as [
      Role,
      keyof typeof FX.users,
    ][]) {
      const user = await testDb.appUser.findUnique({
        where: { id: FX.users[fixtureKey].id },
      });
      if (!user) continue;
      const reset = asUser({ ...user, role });
      try {
        const response = await exportRoute.GET();
        const text = await response.text();
        if (response.status !== 200) continue;

        // Clergy legitimately see private notes and pastoral dates; parish
        // staff/admin legitimately see work notes. Everyone else must not.
        const allowed: string[] = [];
        if (role === Role.CLERGY) {
          allowed.push(SENTINELS.privateNote, SENTINELS.dateOfBirth, SENTINELS.baptismDate);
        }
        if (role === Role.PASTORAL_DATA_ACCESSOR || role === Role.PARISH_ADMIN) {
          allowed.push(SENTINELS.dateOfBirth, SENTINELS.baptismDate);
        }
        if (
          role === Role.PARISH_ADMIN ||
          role === Role.PARISH_STAFF
        ) {
          allowed.push(SENTINELS.workNotes, SENTINELS.skills);
        }

        for (const sentinel of FORBIDDEN) {
          if (allowed.includes(sentinel)) continue;
          expect(
            text.includes(sentinel),
            `members export leaked "${sentinel}" to ${role}`,
          ).toBe(false);
        }
      } finally {
        reset();
      }
    }
  });

  it('diocese Tier-2 views expose no sensitive values', async () => {
    const claims = makeClaims({
      userId: FX.users.dioceseAdmin.id,
      dioceseId: FX.dioceseId,
      parishId: null,
      role: 'diocese_report_viewer',
    });
    const views = [
      'diocese_parish_member_summary',
      'diocese_parish_family_summary',
      'diocese_parish_giving_summary',
      'diocese_approval_policy_dashboard',
      'diocese_approval_request_summary',
      'diocese_parish_membership_trend',
      'diocese_parish_sacramental_summary',
      'diocese_parish_attendance_summary',
      'diocese_parish_event_summary',
      'diocese_parish_pledge_summary',
    ];

    await withTenantSession(claims, async (client) => {
      for (const view of views) {
        const { rows } = await client.query(`SELECT * FROM ${view}`);
        expectNoSensitive(JSON.stringify(rows), `view ${view}`);
      }
    });
  });

  it('webhook payloads carry ids and scalars only', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    const reset = asUser(admin);
    try {
      await membersRoute.POST(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: 'Leak',
            lastName: 'Check',
            familyId: FX.families.smithId,
            workNotes: SENTINELS.workNotes,
          }),
        }),
      );
    } finally {
      reset();
    }

    const events = await testDb.webhookEvent.findMany();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expectNoSensitive(
        JSON.stringify(event.payload),
        `webhook payload ${event.type}`,
      );
    }
  });
});
