/**
 * Rolling “this week” window for birthdays / anniversaries.
 *
 * Product default: today 00:00 UTC through end of (today + 6 days) UTC —
 * a 7-day look-ahead, not calendar Monday–Sunday. UTC is intentional for v1
 * so server and tests are deterministic; parish-local TZ can land later.
 *
 * Leap-day policy: Feb 29 occurrences in non-leap years are treated as Feb 28.
 */

export type DateParts = { month: number; day: number }; // month 1–12

export type CalendarWindow = {
  /** Inclusive start (UTC midnight of “today”). */
  start: Date;
  /** Inclusive end (UTC end-of-day of start+6). */
  end: Date;
};

/** Build a 7-day window starting at UTC midnight of `now` (or the given date). */
export function weekAheadWindow(now: Date = new Date()): CalendarWindow {
  const start = utcMidnight(now);
  const endDay = addUtcDays(start, 6);
  const end = new Date(endDay);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function utcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Next occurrence of a month/day on or after `from` (UTC), within a year.
 * Feb 29 → Feb 28 when the target year is not a leap year.
 */
export function nextOccurrence(
  month: number,
  day: number,
  from: Date,
): Date {
  const y = from.getUTCFullYear();
  const candidates = [occurrenceInYear(y, month, day), occurrenceInYear(y + 1, month, day)];
  const fromMid = utcMidnight(from);
  for (const c of candidates) {
    if (c.getTime() >= fromMid.getTime()) return c;
  }
  // Fallback — should not hit
  return occurrenceInYear(y + 1, month, day);
}

export function occurrenceInYear(
  year: number,
  month: number,
  day: number,
): Date {
  const m = month;
  let d = day;
  if (m === 2 && d === 29 && !isLeapYear(year)) {
    d = 28;
  }
  return new Date(Date.UTC(year, m - 1, d));
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** True if the annual date falls inside the window (handles year wrap). */
export function fallsInWindow(
  month: number,
  day: number,
  window: CalendarWindow,
): boolean {
  const occ = nextOccurrence(month, day, window.start);
  return occ.getTime() >= window.start.getTime() && occ.getTime() <= window.end.getTime();
}

export function partsFromDate(d: Date): DateParts {
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Age the person turns on the next occurrence of their DOB on/after window.start. */
export function ageTurningOnOccurrence(dateOfBirth: Date, occurrence: Date): number {
  return occurrence.getUTCFullYear() - dateOfBirth.getUTCFullYear();
}

/** Whole years completed as of `asOf` for an anniversary date. */
export function yearsCompleted(startDate: Date, asOf: Date): number {
  let years = asOf.getUTCFullYear() - startDate.getUTCFullYear();
  const m = asOf.getUTCMonth() - startDate.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < startDate.getUTCDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

/** Age bands aligned with the parish demographics stacked bar chart. */
export const AGE_BANDS = [
  { key: '0-3', label: '0-3', min: 0, max: 3 },
  { key: '4-11', label: '4-11', min: 4, max: 11 },
  { key: '12-18', label: '12-18', min: 12, max: 18 },
  { key: '19-25', label: '19-25', min: 19, max: 25 },
  { key: '26-35', label: '26-35', min: 26, max: 35 },
  { key: '36-50', label: '36-50', min: 36, max: 50 },
  { key: '51-64', label: '51-64', min: 51, max: 64 },
  { key: '65+', label: '65+', min: 65, max: 200 },
] as const;

export function ageInYears(dateOfBirth: Date, asOf: Date = new Date()): number {
  return yearsCompleted(dateOfBirth, asOf);
}

export function ageBandKey(age: number): string {
  for (const band of AGE_BANDS) {
    if (age >= band.min && age <= band.max) return band.key;
  }
  return 'unknown';
}
