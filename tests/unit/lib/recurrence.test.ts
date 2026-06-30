import { describe, expect, it } from 'vitest';
import {
  expandOccurrences,
  parseRecurrenceRule,
} from '@/lib/events/recurrence';

const window = {
  windowStart: new Date('2026-01-01T00:00:00Z'),
  windowEnd: new Date('2026-03-31T23:59:59Z'),
};

describe('parseRecurrenceRule', () => {
  it('parses FREQ/INTERVAL/COUNT', () => {
    const parsed = parseRecurrenceRule('FREQ=WEEKLY;INTERVAL=2;COUNT=5');
    expect(parsed.freq).toBe('WEEKLY');
    expect(parsed.interval).toBe(2);
    expect(parsed.count).toBe(5);
  });

  it('tolerates the RRULE: prefix and parses UNTIL', () => {
    const parsed = parseRecurrenceRule('RRULE:FREQ=DAILY;UNTIL=20260110');
    expect(parsed.freq).toBe('DAILY');
    expect(parsed.until?.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });

  it('throws on unsupported FREQ', () => {
    expect(() => parseRecurrenceRule('FREQ=YEARLY')).toThrow();
  });
});

describe('expandOccurrences', () => {
  it('returns a single occurrence when there is no rule', () => {
    const occ = expandOccurrences(
      new Date('2026-02-01T10:00:00Z'),
      null,
      window,
    );
    expect(occ).toHaveLength(1);
  });

  it('respects COUNT', () => {
    const occ = expandOccurrences(
      new Date('2026-01-05T09:00:00Z'),
      'FREQ=WEEKLY;COUNT=3',
      window,
    );
    expect(occ).toHaveLength(3);
    expect(occ[1].toISOString()).toBe('2026-01-12T09:00:00.000Z');
  });

  it('respects UNTIL', () => {
    const occ = expandOccurrences(
      new Date('2026-01-01T00:00:00Z'),
      'FREQ=DAILY;UNTIL=20260105',
      window,
    );
    expect(occ).toHaveLength(5);
  });

  it('clips an unbounded rule to the window (no infinite series)', () => {
    const occ = expandOccurrences(
      new Date('2026-01-01T00:00:00Z'),
      'FREQ=MONTHLY',
      window,
    );
    // Jan, Feb, Mar within the window.
    expect(occ).toHaveLength(3);
  });

  it('honours INTERVAL', () => {
    const occ = expandOccurrences(
      new Date('2026-01-01T00:00:00Z'),
      'FREQ=DAILY;INTERVAL=10;COUNT=4',
      window,
    );
    expect(occ.map((d) => d.toISOString())).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-11T00:00:00.000Z',
      '2026-01-21T00:00:00.000Z',
      '2026-01-31T00:00:00.000Z',
    ]);
  });
});
