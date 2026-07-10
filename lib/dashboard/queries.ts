import {
  Gender,
  MemberStatus,
  MessageStatus,
  Prisma,
  RegistrationStatus,
  SharingRequestStatus,
  type PrismaClient,
} from '@prisma/client';
import {
  AGE_BANDS,
  ageBandKey,
  ageInYears,
  ageTurningOnOccurrence,
  fallsInWindow,
  nextOccurrence,
  partsFromDate,
  weekAheadWindow,
  yearsCompleted,
} from '@/lib/dashboard/calendar-window';
import type {
  AgeBandCount,
  AgeGenderBand,
  AnniversaryRow,
  BirthdayRow,
  DioceseDashboardRaw,
  GenderTotals,
  NewMemberRow,
  ParishDashboardRaw,
  StatusCounts,
  UpcomingEventRow,
  WorkItem,
} from '@/lib/dashboard/types';

type Tx = Prisma.TransactionClient | PrismaClient;

const LIST_LIMIT = 12;
const NEW_MEMBER_DAYS = 30;

/** Parish "new members" list + KPI: active and pending only. */
export const PARISH_NEW_MEMBER_STATUSES: MemberStatus[] = [
  MemberStatus.ACTIVE,
  MemberStatus.PENDING,
];

/** Diocese "new members" list + KPI: active only (matches list query). */
export const DIOCESE_NEW_MEMBER_STATUSES: MemberStatus[] = [MemberStatus.ACTIVE];

/**
 * Gender census for members that already have a date of birth.
 * Must not pad with no-DOB members — legend totals must equal stacked bars.
 */
export function genderTotalsFromDobMembers(
  members: Array<{ gender: Gender | null }>,
): GenderTotals {
  const totals: GenderTotals = { male: 0, female: 0, unassigned: 0 };
  for (const m of members) {
    if (m.gender === Gender.MALE) totals.male += 1;
    else if (m.gender === Gender.FEMALE) totals.female += 1;
    else totals.unassigned += 1;
  }
  return totals;
}

function emptyStatusCounts(): StatusCounts {
  return {
    ACTIVE: 0,
    INACTIVE: 0,
    PENDING: 0,
    DECEASED: 0,
    MOVED: 0,
  };
}

export async function loadParishDashboardRaw(
  tx: Tx,
  parishId: string,
  dioceseId: string,
  now: Date = new Date(),
): Promise<ParishDashboardRaw> {
  const window = weekAheadWindow(now);
  const newSince = new Date(now);
  newSince.setUTCDate(newSince.getUTCDate() - NEW_MEMBER_DAYS);
  const eventUntil = new Date(now);
  eventUntil.setUTCDate(eventUntil.getUTCDate() + 7);
  const stuckBefore = new Date(now.getTime() - 60 * 60 * 1000);
  const emergencyUntil = new Date(now);
  emergencyUntil.setUTCDate(emergencyUntil.getUTCDate() + 7);

  const parish = await tx.parish.findFirst({
    where: { id: parishId },
    select: { id: true, name: true },
  });

  const [
    statusGroups,
    familiesActive,
    familiesTotal,
    newMemberRows,
    pendingRegs,
    pendingRegCount,
    pendingMembers,
    pendingSharing,
    sharingCount,
    failedMessages,
    queuedStuck,
    upcomingEvents,
    expiringEmergency,
    pastoralRows,
    anniversaryRows,
  ] = await Promise.all([
    tx.member.groupBy({
      by: ['status'],
      where: { parishId },
      _count: { _all: true },
    }),
    tx.family.count({ where: { parishId, isActive: true } }),
    tx.family.count({ where: { parishId } }),
    tx.member.findMany({
      where: {
        parishId,
        createdAt: { gte: newSince },
        status: { in: PARISH_NEW_MEMBER_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberIdentifier: true,
        createdAt: true,
        status: true,
      },
    }),
    tx.memberRegistration.findMany({
      where: { parishId, approvalStatus: RegistrationStatus.PENDING },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true },
    }),
    tx.memberRegistration.count({
      where: { parishId, approvalStatus: RegistrationStatus.PENDING },
    }),
    tx.member.count({
      where: { parishId, status: MemberStatus.PENDING },
    }),
    tx.dataSharingRequest.findMany({
      where: { parishId, status: SharingRequestStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, dataCategory: true },
    }),
    tx.dataSharingRequest.count({
      where: { parishId, status: SharingRequestStatus.PENDING },
    }),
    tx.message.count({
      where: { parishId, status: MessageStatus.FAILED },
    }),
    tx.message.count({
      where: {
        parishId,
        status: { in: [MessageStatus.QUEUED, MessageStatus.PROCESSING] },
        createdAt: { lt: stuckBefore },
      },
    }),
    tx.event.findMany({
      where: {
        parishId,
        startAt: { gte: now, lte: eventUntil },
      },
      orderBy: { startAt: 'asc' },
      take: LIST_LIMIT,
      select: { id: true, name: true, startAt: true },
    }),
    tx.emergencyAccessGrant.findMany({
      where: {
        parishId,
        isActive: true,
        expiresAt: { lte: emergencyUntil, gte: now },
      },
      take: 5,
      select: { id: true, justification: true },
    }),
    tx.member.findMany({
      where: {
        parishId,
        status: MemberStatus.ACTIVE,
        pastoralData: { is: { dateOfBirth: { not: null } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        pastoralData: { select: { dateOfBirth: true } },
      },
    }),
    tx.family.findMany({
      where: {
        parishId,
        isActive: true,
        pastoralData: { is: { anniversaryDate: { not: null } } },
      },
      select: {
        id: true,
        familyName: true,
        pastoralData: { select: { anniversaryDate: true } },
      },
    }),
  ]);

  const byStatus = emptyStatusCounts();
  for (const g of statusGroups) {
    byStatus[g.status] = g._count._all;
  }
  const membersTotal = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const membersActive = byStatus.ACTIVE;

  // Age × gender stacked series + birthdays from pastoral DOB rows
  const bandGender = new Map<
    string,
    { male: number; female: number; unassigned: number }
  >();
  for (const b of AGE_BANDS) {
    bandGender.set(b.key, { male: 0, female: 0, unassigned: 0 });
  }
  const birthdaysThisWeek: BirthdayRow[] = [];
  for (const m of pastoralRows) {
    const dob = m.pastoralData?.dateOfBirth;
    if (!dob) continue;

    const age = ageInYears(dob, now);
    const key = ageBandKey(age);
    const bucket = bandGender.get(key) ?? {
      male: 0,
      female: 0,
      unassigned: 0,
    };
    if (!bandGender.has(key)) bandGender.set(key, bucket);

    if (m.gender === Gender.MALE) {
      bucket.male += 1;
    } else if (m.gender === Gender.FEMALE) {
      bucket.female += 1;
    } else {
      bucket.unassigned += 1;
    }

    const parts = partsFromDate(dob);
    if (fallsInWindow(parts.month, parts.day, window)) {
      const occ = nextOccurrence(parts.month, parts.day, window.start);
      birthdaysThisWeek.push({
        memberId: m.id,
        name: `${m.firstName} ${m.lastName}`,
        occurrenceDate: occ.toISOString().slice(0, 10),
        dateOfBirth: dob.toISOString().slice(0, 10),
        turnsAge: ageTurningOnOccurrence(dob, occ),
      });
    }
  }

  // Only DOB-bearing rows (pastoralRows query filter) — never pad no-DOB actives.
  const genderTotals = genderTotalsFromDobMembers(pastoralRows);

  const ageGenderBands: AgeGenderBand[] = AGE_BANDS.map((b) => {
    const g = bandGender.get(b.key) ?? { male: 0, female: 0, unassigned: 0 };
    return {
      key: b.key,
      label: b.label,
      male: g.male,
      female: g.female,
      unassigned: g.unassigned,
    };
  });

  const ageBands: AgeBandCount[] = ageGenderBands.map((b) => ({
    key: b.key,
    label: b.label,
    count: b.male + b.female + b.unassigned,
  }));

  birthdaysThisWeek.sort((a, b) =>
    a.occurrenceDate.localeCompare(b.occurrenceDate),
  );

  const anniversariesThisWeek: AnniversaryRow[] = [];
  for (const f of anniversaryRows) {
    const ann = f.pastoralData?.anniversaryDate;
    if (!ann) continue;
    const parts = partsFromDate(ann);
    if (!fallsInWindow(parts.month, parts.day, window)) continue;
    const occ = nextOccurrence(parts.month, parts.day, window.start);
    anniversariesThisWeek.push({
      familyId: f.id,
      familyName: f.familyName,
      occurrenceDate: occ.toISOString().slice(0, 10),
      anniversaryDate: ann.toISOString().slice(0, 10),
      years: yearsCompleted(ann, occ),
    });
  }
  anniversariesThisWeek.sort((a, b) =>
    a.occurrenceDate.localeCompare(b.occurrenceDate),
  );

  const newMembers: NewMemberRow[] = newMemberRows.map((m) => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
    memberIdentifier: m.memberIdentifier,
    createdAt: m.createdAt.toISOString(),
    status: m.status,
  }));

  const upcoming: UpcomingEventRow[] = upcomingEvents.map((e) => ({
    id: e.id,
    name: e.name,
    startAt: e.startAt.toISOString(),
  }));

  const workItems: WorkItem[] = [
    {
      key: 'pending_registrations',
      title: 'Pending self-registrations',
      count: pendingRegCount,
      severity: pendingRegCount > 0 ? 'warning' : 'info',
      href: '/registrations',
      preview: pendingRegs.map((r) => ({
        id: r.id,
        label: `${r.firstName} ${r.lastName}`,
      })),
    },
    {
      key: 'pending_members',
      title: 'Pending member records',
      count: pendingMembers,
      severity: pendingMembers > 0 ? 'warning' : 'info',
      href: '/members',
    },
    {
      key: 'pending_sharing_requests',
      title: 'Open sharing requests',
      count: sharingCount,
      severity: sharingCount > 0 ? 'urgent' : 'info',
      href: '/sharing',
      preview: pendingSharing.map((r) => ({
        id: r.id,
        label: r.dataCategory,
      })),
    },
  ];

  workItems.push(
    {
      key: 'failed_messages',
      title: 'Failed messages',
      count: failedMessages,
      severity: failedMessages > 0 ? 'urgent' : 'info',
      href: '/messages',
    },
    {
      key: 'queued_messages',
      title: 'Stuck queued messages',
      count: queuedStuck,
      severity: queuedStuck > 0 ? 'warning' : 'info',
      href: '/messages',
    },
    {
      key: 'upcoming_events',
      title: 'Events in the next 7 days',
      count: upcoming.length,
      severity: 'info',
      href: '/events',
      preview: upcoming.slice(0, 5).map((e) => ({ id: e.id, label: e.name })),
    },
    {
      key: 'expiring_emergency_access',
      title: 'Emergency access expiring soon',
      count: expiringEmergency.length,
      severity: expiringEmergency.length > 0 ? 'warning' : 'info',
      href: '/sharing',
      preview: expiringEmergency.map((g) => ({
        id: g.id,
        label: g.justification.slice(0, 60),
      })),
    },
  );

  return {
    scope: {
      dioceseId,
      parishId,
      parishName: parish?.name ?? null,
    },
    stats: {
      membersActive,
      membersTotal,
      familiesActive,
      familiesTotal,
      newMembersLast30Days: await tx.member.count({
        where: {
          parishId,
          createdAt: { gte: newSince },
          status: { in: PARISH_NEW_MEMBER_STATUSES },
        },
      }),
      pendingRegistrations: pendingRegCount,
    },
    demographics: { byStatus, ageBands, ageGenderBands, genderTotals },
    birthdaysThisWeek: birthdaysThisWeek.slice(0, LIST_LIMIT),
    anniversariesThisWeek: anniversariesThisWeek.slice(0, LIST_LIMIT),
    newMembers,
    workItems,
    upcomingEvents: upcoming,
  };
}

export async function loadDioceseDashboardRaw(
  tx: Tx,
  dioceseId: string,
  now: Date = new Date(),
): Promise<DioceseDashboardRaw> {
  const newSince = new Date(now);
  newSince.setUTCDate(newSince.getUTCDate() - NEW_MEMBER_DAYS);

  type MemberSummaryRow = {
    parish_id: string;
    active_count: number;
    inactive_count: number;
    deceased_count: number;
    moved_count: number;
    total_count: number;
  };
  type FamilySummaryRow = {
    parish_id: string;
    family_count: number;
    active_family_count: number;
  };

  const [memberRows, familyRows, parishCount, pendingSharing, pendingRegs, recentMembers] =
    await Promise.all([
      tx.$queryRaw<MemberSummaryRow[]>`
        SELECT parish_id, active_count, inactive_count, deceased_count, moved_count, total_count
        FROM diocese_parish_member_summary
        ORDER BY parish_id
      `,
      tx.$queryRaw<FamilySummaryRow[]>`
        SELECT parish_id, family_count, active_family_count
        FROM diocese_parish_family_summary
        ORDER BY parish_id
      `,
      tx.parish.count({ where: { dioceseId, isActive: true } }),
      tx.dataSharingRequest.count({
        where: { dioceseId, status: SharingRequestStatus.PENDING },
      }),
      tx.memberRegistration.count({
        where: { dioceseId, approvalStatus: RegistrationStatus.PENDING },
      }),
      tx.member.findMany({
        where: {
          dioceseId,
          createdAt: { gte: newSince },
          status: { in: DIOCESE_NEW_MEMBER_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberIdentifier: true,
          createdAt: true,
          status: true,
        },
      }),
    ]);

  const byStatus = emptyStatusCounts();
  let membersActive = 0;
  let membersTotal = 0;
  for (const row of memberRows) {
    byStatus.ACTIVE += Number(row.active_count);
    byStatus.INACTIVE += Number(row.inactive_count);
    byStatus.DECEASED += Number(row.deceased_count);
    byStatus.MOVED += Number(row.moved_count);
    membersActive += Number(row.active_count);
    membersTotal += Number(row.total_count);
  }
  // PENDING may not be in tier-2 view — leave 0 or compute separately
  byStatus.PENDING = await tx.member.count({
    where: { dioceseId, status: MemberStatus.PENDING },
  });

  let familiesActive = 0;
  let familiesTotal = 0;
  for (const row of familyRows) {
    familiesActive += Number(row.active_family_count);
    familiesTotal += Number(row.family_count);
  }

  const workItems: WorkItem[] = [
    {
      key: 'pending_sharing_requests',
      title: 'Pending sharing requests',
      count: pendingSharing,
      severity: pendingSharing > 0 ? 'urgent' : 'info',
      href: '/sharing',
    },
    {
      key: 'pending_registrations',
      title: 'Pending registrations (all parishes)',
      count: pendingRegs,
      severity: pendingRegs > 0 ? 'warning' : 'info',
      href: '/parishes',
    },
  ];

  return {
    scope: { dioceseId, parishId: null, parishName: null },
    stats: {
      membersActive,
      membersTotal,
      familiesActive,
      familiesTotal,
      newMembersLast30Days: await tx.member.count({
        where: {
          dioceseId,
          createdAt: { gte: newSince },
          status: { in: DIOCESE_NEW_MEMBER_STATUSES },
        },
      }),
      pendingRegistrations: pendingRegs,
      pendingWorkItemCount: 0,
      parishCount,
    },
    demographics: { byStatus },
    newMembers: recentMembers.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      memberIdentifier: m.memberIdentifier,
      createdAt: m.createdAt.toISOString(),
      status: m.status,
    })),
    workItems,
  };
}
