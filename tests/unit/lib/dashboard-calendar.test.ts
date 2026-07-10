import { describe, expect, it } from 'vitest';
import {
  ageBandKey,
  ageInYears,
  fallsInWindow,
  nextOccurrence,
  occurrenceInYear,
  partsFromDate,
  weekAheadWindow,
} from '@/lib/dashboard/calendar-window';

describe('weekAheadWindow', () => {
  it('spans 7 days from UTC midnight of the given day', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 14, 30)); // Jun 15 2026
    const w = weekAheadWindow(now);
    expect(w.start.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-21T23:59:59.999Z');
  });
});

describe('fallsInWindow', () => {
  it('includes birthdays in the next 7 days', () => {
    const w = weekAheadWindow(new Date(Date.UTC(2026, 2, 10))); // Mar 10
    expect(fallsInWindow(3, 10, w)).toBe(true); // today
    expect(fallsInWindow(3, 16, w)).toBe(true); // +6
    expect(fallsInWindow(3, 17, w)).toBe(false); // +7 out
    expect(fallsInWindow(3, 9, w)).toBe(false); // yesterday → next year
  });

  it('handles year wrap (late December into January)', () => {
    const w = weekAheadWindow(new Date(Date.UTC(2026, 11, 28))); // Dec 28
    expect(fallsInWindow(12, 30, w)).toBe(true);
    expect(fallsInWindow(1, 2, w)).toBe(true); // Jan 2 is within +6 of Dec 28
    expect(fallsInWindow(1, 5, w)).toBe(false);
  });
});

describe('leap day policy', () => {
  it('maps Feb 29 to Feb 28 in non-leap years', () => {
    const occ = occurrenceInYear(2026, 2, 29); // not leap
    expect(partsFromDate(occ)).toEqual({ month: 2, day: 28 });
  });

  it('keeps Feb 29 in leap years', () => {
    const occ = occurrenceInYear(2028, 2, 29);
    expect(partsFromDate(occ)).toEqual({ month: 2, day: 29 });
  });

  it('nextOccurrence after Feb 28 non-leap uses Feb 28 for Feb-29 DOB', () => {
    const from = new Date(Date.UTC(2026, 1, 1)); // Feb 1 2026
    const next = nextOccurrence(2, 29, from);
    expect(partsFromDate(next)).toEqual({ month: 2, day: 28 });
    expect(next.getUTCFullYear()).toBe(2026);
  });
});

describe('age helpers', () => {
  it('computes age in whole years', () => {
    const dob = new Date(Date.UTC(2000, 0, 15));
    expect(ageInYears(dob, new Date(Date.UTC(2026, 0, 14)))).toBe(25);
    expect(ageInYears(dob, new Date(Date.UTC(2026, 0, 15)))).toBe(26);
  });

  it('maps ages into bands', () => {
    expect(ageBandKey(2)).toBe('0-3');
    expect(ageBandKey(10)).toBe('4-11');
    expect(ageBandKey(15)).toBe('12-18');
    expect(ageBandKey(22)).toBe('19-25');
    expect(ageBandKey(30)).toBe('26-35');
    expect(ageBandKey(45)).toBe('36-50');
    expect(ageBandKey(55)).toBe('51-64');
    expect(ageBandKey(80)).toBe('65+');
  });
});
