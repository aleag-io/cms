/**
 * Minimal iCal RRULE expansion (PA-4).
 *
 * Supports the subset the parish calendar needs:
 *   FREQ=DAILY|WEEKLY|MONTHLY  (required)
 *   INTERVAL=<n>               (optional, default 1)
 *   COUNT=<n>                  (optional)
 *   UNTIL=<YYYYMMDD or ISO>    (optional)
 *
 * Returns the series of occurrence start times that fall within
 * [windowStart, windowEnd]. Expansion is lazy/bounded — an unbounded rule
 * (no COUNT/UNTIL) is clipped to the window so we never materialize an
 * infinite series. Pure and unit-tested.
 */

export interface RecurrenceWindow {
  windowStart: Date;
  windowEnd: Date;
}

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface ParsedRule {
  freq: Freq;
  interval: number;
  count?: number;
  until?: Date;
}

export function parseRecurrenceRule(rule: string): ParsedRule {
  const parts = rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const map: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) map[key.toUpperCase()] = value;
  }

  const freq = map.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') {
    throw new Error(`Unsupported RRULE FREQ: ${map.FREQ ?? '(none)'}`);
  }

  const interval = map.INTERVAL ? Math.max(1, parseInt(map.INTERVAL, 10)) : 1;
  const count = map.COUNT ? parseInt(map.COUNT, 10) : undefined;
  const until = map.UNTIL ? parseUntil(map.UNTIL) : undefined;

  return { freq, interval, count, until };
}

function parseUntil(value: string): Date {
  // Accept compact iCal (YYYYMMDD / YYYYMMDDTHHMMSSZ) or plain ISO.
  const compact = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/,
  );
  if (compact) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = compact;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable RRULE UNTIL: ${value}`);
  }
  return parsed;
}

function advance(date: Date, freq: Freq, interval: number): Date {
  const next = new Date(date.getTime());
  if (freq === 'DAILY') next.setUTCDate(next.getUTCDate() + interval);
  else if (freq === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * interval);
  else next.setUTCMonth(next.getUTCMonth() + interval);
  return next;
}

/**
 * Expand a recurring event into its occurrence start times within the window.
 * `start` is the first occurrence (DTSTART). When `rule` is null/empty the
 * event is treated as single-occurrence.
 */
export function expandOccurrences(
  start: Date,
  rule: string | null | undefined,
  window: RecurrenceWindow,
  hardCap = 1000,
): Date[] {
  if (!rule) {
    return start >= window.windowStart && start <= window.windowEnd
      ? [start]
      : [];
  }

  const parsed = parseRecurrenceRule(rule);
  const occurrences: Date[] = [];
  let current = new Date(start.getTime());
  let emitted = 0;

  for (let i = 0; i < hardCap; i++) {
    if (parsed.count !== undefined && emitted >= parsed.count) break;
    if (parsed.until && current > parsed.until) break;
    if (current > window.windowEnd) break;

    if (current >= window.windowStart) {
      occurrences.push(new Date(current.getTime()));
    }
    emitted++;
    current = advance(current, parsed.freq, parsed.interval);
  }

  return occurrences;
}
