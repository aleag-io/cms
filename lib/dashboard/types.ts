import type { MemberStatus } from '@prisma/client';

export type DashboardMode = 'parish' | 'diocese' | 'member';

export type WorkItemSeverity = 'info' | 'warning' | 'urgent';

export type StatusCounts = Record<MemberStatus, number>;

export type AgeBandCount = {
  key: string;
  label: string;
  count: number;
};

/** One bar on the demographics stacked chart (age band × gender). */
export type AgeGenderBand = {
  key: string;
  label: string;
  male: number;
  female: number;
  unassigned: number;
};

export type GenderTotals = {
  male: number;
  female: number;
  unassigned: number;
};

export type BirthdayRow = {
  memberId: string;
  name: string;
  /** ISO date of the occurrence within the window (UTC). */
  occurrenceDate: string;
  /** Original DOB ISO date (date-only). */
  dateOfBirth: string;
  turnsAge: number | null;
};

export type AnniversaryRow = {
  familyId: string;
  familyName: string;
  occurrenceDate: string;
  anniversaryDate: string;
  years: number | null;
};

export type NewMemberRow = {
  id: string;
  name: string;
  memberIdentifier: string;
  createdAt: string;
  status: MemberStatus;
};

export type WorkItem = {
  key: string;
  title: string;
  count: number;
  severity: WorkItemSeverity;
  href: string;
  preview?: { id: string; label: string }[];
};

export type UpcomingEventRow = {
  id: string;
  name: string;
  startAt: string;
};

export type DashboardStats = {
  membersActive: number;
  membersTotal: number;
  familiesActive: number;
  familiesTotal: number;
  newMembersLast30Days: number;
  pendingRegistrations: number;
  pendingWorkItemCount: number;
  /** Diocese mode only */
  parishCount?: number;
};

export type DashboardDemographics = {
  byStatus: StatusCounts;
  ageBands?: AgeBandCount[];
  /** Stacked age × gender series for the demographics chart (pastoral roles). */
  ageGenderBands?: AgeGenderBand[];
  genderTotals?: GenderTotals;
};

export type DashboardScope = {
  dioceseId: string;
  parishId: string | null;
  parishName?: string | null;
};

export type DashboardDto = {
  mode: DashboardMode;
  generatedAt: string;
  scope: DashboardScope;
  stats: DashboardStats;
  demographics: DashboardDemographics;
  birthdaysThisWeek?: BirthdayRow[];
  anniversariesThisWeek?: AnniversaryRow[];
  newMembers: NewMemberRow[];
  workItems: WorkItem[];
  upcomingEvents?: UpcomingEventRow[];
  /** Member mode extras */
  memberLinks?: { href: string; title: string; description: string }[];
};

/** Internal raw parish bundle before role projection. */
export type ParishDashboardRaw = {
  scope: DashboardScope;
  stats: Omit<DashboardStats, 'pendingWorkItemCount'>;
  demographics: {
    byStatus: StatusCounts;
    ageBands: AgeBandCount[];
    ageGenderBands: AgeGenderBand[];
    genderTotals: GenderTotals;
  };
  birthdaysThisWeek: BirthdayRow[];
  anniversariesThisWeek: AnniversaryRow[];
  newMembers: NewMemberRow[];
  workItems: WorkItem[];
  upcomingEvents: UpcomingEventRow[];
};

export type DioceseDashboardRaw = {
  scope: DashboardScope;
  stats: DashboardStats;
  demographics: { byStatus: StatusCounts };
  newMembers: NewMemberRow[];
  workItems: WorkItem[];
};
