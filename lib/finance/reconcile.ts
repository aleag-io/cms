/**
 * Bank reconciliation: CSV-in only, app-side matching (PA-20). No bank API.
 * Expected columns (case-insensitive, order-independent): date, amount,
 * description. Amounts may be $-formatted and negative (withdrawals).
 */

import { parseCentsInput } from '@/lib/finance/money';

export type ParsedBankRow = {
  postedDate: Date;
  amountCents: bigint;
  descriptionRaw: string;
};

export type CsvParseResult = {
  rows: ParsedBankRow[];
  rejected: { line: number; reason: string }[];
};

/** Split a single CSV line, honoring double-quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseBankCsv(text: string): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const rows: ParsedBankRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  if (lines.length === 0) return { rows, rejected };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const amountIdx = header.findIndex((h) => h.includes('amount'));
  const descIdx = header.findIndex(
    (h) => h.includes('desc') || h.includes('memo') || h.includes('payee'),
  );
  if (dateIdx < 0 || amountIdx < 0) {
    rejected.push({ line: 1, reason: 'CSV must have date and amount columns' });
    return { rows, rejected };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const rawDate = cols[dateIdx];
    const rawAmount = cols[amountIdx];
    const date = new Date(rawDate);
    if (!rawDate || Number.isNaN(date.getTime())) {
      rejected.push({ line: i + 1, reason: `invalid date "${rawDate}"` });
      continue;
    }
    let amountCents: bigint;
    try {
      amountCents = parseCentsInput(rawAmount.replace(/[()]/g, (m) => (m === '(' ? '-' : '')));
    } catch {
      rejected.push({ line: i + 1, reason: `invalid amount "${rawAmount}"` });
      continue;
    }
    rows.push({
      postedDate: date,
      amountCents,
      descriptionRaw: descIdx >= 0 ? (cols[descIdx] ?? '') : '',
    });
  }
  return { rows, rejected };
}

export type MatchCandidate = {
  journalLineId: string;
  amountCents: bigint;
  entryDate: Date;
};

/**
 * Propose a journal-line match for each bank line by absolute amount within a
 * date window. Greedy: each journal line is used at most once.
 */
export function proposeMatches(
  bankLines: { id: string; amountCents: bigint; postedDate: Date }[],
  candidates: MatchCandidate[],
  windowDays = 5,
): Map<string, string> {
  const used = new Set<string>();
  const matches = new Map<string, string>();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  for (const bank of bankLines) {
    const target = bank.amountCents < 0n ? -bank.amountCents : bank.amountCents;
    let best: MatchCandidate | null = null;
    let bestDelta = Infinity;
    for (const c of candidates) {
      if (used.has(c.journalLineId)) continue;
      const amt = c.amountCents < 0n ? -c.amountCents : c.amountCents;
      if (amt !== target) continue;
      const delta = Math.abs(c.entryDate.getTime() - bank.postedDate.getTime());
      if (delta <= windowMs && delta < bestDelta) {
        best = c;
        bestDelta = delta;
      }
    }
    if (best) {
      used.add(best.journalLineId);
      matches.set(bank.id, best.journalLineId);
    }
  }
  return matches;
}
