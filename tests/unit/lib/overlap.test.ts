import { describe, expect, it } from 'vitest';
import { findBookingConflicts, rangesOverlap } from '@/lib/facilities/overlap';

const r = (s: string, e: string) => ({
  startAt: new Date(s),
  endAt: new Date(e),
});

describe('rangesOverlap (PA-5)', () => {
  it('detects overlapping ranges', () => {
    expect(
      rangesOverlap(
        r('2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z'),
        r('2026-01-01T11:00:00Z', '2026-01-01T13:00:00Z'),
      ),
    ).toBe(true);
  });

  it('treats touching ranges as non-overlapping (half-open)', () => {
    expect(
      rangesOverlap(
        r('2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z'),
        r('2026-01-01T12:00:00Z', '2026-01-01T13:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('findBookingConflicts', () => {
  const existing = [
    { id: 'a', ...r('2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z') },
    { id: 'b', ...r('2026-01-01T14:00:00Z', '2026-01-01T16:00:00Z') },
  ];

  it('returns the conflicting bookings', () => {
    const conflicts = findBookingConflicts(
      r('2026-01-01T11:00:00Z', '2026-01-01T15:00:00Z'),
      existing,
    );
    expect(conflicts.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('returns none when there is a free slot', () => {
    const conflicts = findBookingConflicts(
      r('2026-01-01T12:00:00Z', '2026-01-01T14:00:00Z'),
      existing,
    );
    expect(conflicts).toHaveLength(0);
  });

  it('rejects an inverted range', () => {
    expect(() =>
      findBookingConflicts(
        r('2026-01-01T14:00:00Z', '2026-01-01T12:00:00Z'),
        existing,
      ),
    ).toThrow();
  });
});
