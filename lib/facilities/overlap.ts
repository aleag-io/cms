/**
 * Facility booking overlap detection (PA-5).
 *
 * The DB exclusion constraint (no_facility_overlap) is the guarantee; this
 * pure helper powers friendly pre-flight 409s and calendar shading. Two
 * confirmed bookings on the same facility overlap when their half-open time
 * ranges intersect: [startA, endA) ∩ [startB, endB) ≠ ∅.
 */

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/**
 * Return the existing bookings that conflict with `candidate`. `existing`
 * should already be filtered to the same facility and to CONFIRMED status.
 */
export function findBookingConflicts<T extends TimeRange>(
  candidate: TimeRange,
  existing: T[],
): T[] {
  if (candidate.endAt <= candidate.startAt) {
    throw new Error('Booking endAt must be after startAt');
  }
  return existing.filter((b) => rangesOverlap(candidate, b));
}
