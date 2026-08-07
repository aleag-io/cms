/**
 * Demo seed scale profiles.
 *
 * - `local` — default for day-to-day `npm run db:seed` (fast, still multi-parish).
 * - `demo`  — denser volumes for preview.cms.aleag.io capability tours.
 *
 * Overrides (optional env):
 *   SEED_FAMILY_MULTIPLIER   — integer ≥1 (demo default 2)
 *   SEED_FINANCE_FULL_PARISHES — integer or "all" (demo default all)
 *   SEED_BATCH_MONTHS        — integer ≥1 (demo default 12)
 *   SEED_SECONDARY_FRACTION  — 0–1 adults with multi-parish membership (demo 0.07)
 */

export type SeedProfileName = 'local' | 'demo';

export type SeedProfile = {
  name: SeedProfileName;
  /** How many times to repeat the base family template list per parish. */
  familyMultiplier: number;
  /** Parishes that get the full giving/vendor path (rest get a light sample). */
  financeFullParishes: number | 'all';
  /** Months of Sunday offering batches to generate per full-finance parish. */
  batchMonths: number;
  /** Fraction of active adults that receive a secondary parish membership. */
  secondaryMemberFraction: number;
  /** Extra pending self-registrations per parish beyond the base pair. */
  extraPendingRegistrations: number;
  /** Program enrollment target size (capped by pool). */
  enrollmentTarget: number;
  /** Open-mode org membership target size. */
  orgMembershipTarget: number;
  /** Event attendance sample size. */
  eventAttendanceTarget: number;
  /** Sacramental baptism sample size (capped by active members). */
  sacramentalSampleSize: number;
  /** How many of the first N couples get marriage records. */
  marriageCoupleCount: number;
  /** Sessions per program with attendance (first N programs). */
  programSessionCount: number;
  /** Programs that get sessions (by creation order). */
  programsWithSessions: number;
  /** Extra org defs beyond base (Altar Guild, etc.). */
  extraOrgs: boolean;
  /** Extra program def (Seniors). */
  extraPrograms: boolean;
  /** More events + facility bookings. */
  denseEvents: boolean;
  /** Extra messages (FAILED status sample). */
  denseMessages: boolean;
  /** Sharing samples across more parishes + expired emergency. */
  denseSharing: boolean;
  /** Pledges per full-finance parish. */
  pledgeCount: number;
  /** Envelope families tagged per parish. */
  envelopeFamilyCount: number;
  /** Include draft journal + pending approval for maker-checker demo. */
  pendingApprovals: boolean;
  /** Monthly operating expense journals per full parish. */
  monthlyExpenseMonths: number;
};

const LOCAL: SeedProfile = {
  name: 'local',
  familyMultiplier: 1,
  financeFullParishes: 3,
  batchMonths: 1,
  secondaryMemberFraction: 0.03,
  extraPendingRegistrations: 0,
  enrollmentTarget: 18,
  orgMembershipTarget: 14,
  eventAttendanceTarget: 25,
  sacramentalSampleSize: 20,
  marriageCoupleCount: 8,
  programSessionCount: 3,
  programsWithSessions: 2,
  extraOrgs: false,
  extraPrograms: false,
  denseEvents: false,
  denseMessages: false,
  denseSharing: false,
  pledgeCount: 5,
  envelopeFamilyCount: 8,
  pendingApprovals: false,
  monthlyExpenseMonths: 0,
};

const DEMO: SeedProfile = {
  name: 'demo',
  familyMultiplier: 2,
  financeFullParishes: 'all',
  batchMonths: 12,
  secondaryMemberFraction: 0.07,
  extraPendingRegistrations: 3,
  enrollmentTarget: 40,
  orgMembershipTarget: 35,
  eventAttendanceTarget: 45,
  sacramentalSampleSize: 80,
  marriageCoupleCount: 20,
  programSessionCount: 6,
  programsWithSessions: 4,
  extraOrgs: true,
  extraPrograms: true,
  denseEvents: true,
  denseMessages: true,
  denseSharing: true,
  pledgeCount: 20,
  envelopeFamilyCount: 20,
  pendingApprovals: true,
  monthlyExpenseMonths: 6,
};

function parseIntEnv(
  env: Record<string, string | undefined>,
  key: string,
): number | undefined {
  const raw = env[key];
  if (raw == null || raw === '') return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseFractionEnv(
  env: Record<string, string | undefined>,
  key: string,
): number | undefined {
  const raw = env[key];
  if (raw == null || raw === '') return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

/**
 * Resolve seed profile from env. Default is `local` so day-to-day reseeds stay fast.
 */
export function resolveSeedProfile(
  env: Record<string, string | undefined> = process.env,
): SeedProfile {
  const nameRaw = (env.SEED_PROFILE ?? 'local').toLowerCase().trim();
  const name: SeedProfileName = nameRaw === 'demo' ? 'demo' : 'local';
  const base: SeedProfile = name === 'demo' ? { ...DEMO } : { ...LOCAL };

  const mult = parseIntEnv(env, 'SEED_FAMILY_MULTIPLIER');
  if (mult != null) base.familyMultiplier = mult;

  const fullRaw = env.SEED_FINANCE_FULL_PARISHES?.toLowerCase().trim();
  if (fullRaw === 'all') {
    base.financeFullParishes = 'all';
  } else if (fullRaw) {
    const n = Number.parseInt(fullRaw, 10);
    if (Number.isFinite(n) && n >= 0) base.financeFullParishes = n;
  }

  const months = parseIntEnv(env, 'SEED_BATCH_MONTHS');
  if (months != null) base.batchMonths = months;

  const frac = parseFractionEnv(env, 'SEED_SECONDARY_FRACTION');
  if (frac != null) base.secondaryMemberFraction = frac;

  return base;
}

export function financeFullParishLimit(
  profile: SeedProfile,
  parishCount: number,
): number {
  if (profile.financeFullParishes === 'all') return parishCount;
  return Math.min(profile.financeFullParishes, parishCount);
}
