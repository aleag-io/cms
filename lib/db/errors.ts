/**
 * Detect specific Postgres constraint violations regardless of how the Prisma
 * driver surfaces them (P2002 for the partial unique index, raw 23P01 for the
 * exclusion constraint). We match on the constraint name in the error payload,
 * which is stable across both paths.
 */

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const meta = (err as { meta?: unknown }).meta;
    return `${err.message} ${meta ? JSON.stringify(meta) : ''}`;
  }
  return String(err);
}

/** PA-16 — second active exclusive membership of the same type/parish. */
export function isExclusiveMembershipViolation(err: unknown): boolean {
  return errorText(err).includes('org_membership_exclusive_active');
}

/** PA-5 — overlapping confirmed facility booking. */
export function isFacilityOverlapViolation(err: unknown): boolean {
  return errorText(err).includes('no_facility_overlap');
}
