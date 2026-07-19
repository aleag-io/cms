// Shared CSV rendering + parsing (R6).
// Rendering neutralizes spreadsheet formula injection (cells leading with
// = + - @ get a leading apostrophe) and applies RFC-4180 quoting — the same
// behavior the member export shipped with in R1. Parsing is the quote-aware
// reader generalized from lib/finance/reconcile.ts.

export function escapeCsvCell(
  value: string | number | boolean | null | undefined,
): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

export type CsvRowError = { line: number; reason: string };

export type CsvParseResult = {
  headers: string[];
  rows: { line: number; cells: string[] }[];
  errors: CsvRowError[];
};

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

/// Parses CSV text. The first non-blank line is the header row. Rows whose
/// column count differs from the header are reported in `errors` (1-based
/// original line numbers) and excluded from `rows`.
export function parseCsv(text: string): CsvParseResult {
  const rawLines = text.split(/\r?\n/);
  const headers: string[] = [];
  const rows: { line: number; cells: string[] }[] = [];
  const errors: CsvRowError[] = [];

  let headerSeen = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trimEnd();
    if (line.trim().length === 0) continue;
    if (!headerSeen) {
      headers.push(...splitCsvLine(line));
      headerSeen = true;
      continue;
    }
    const cells = splitCsvLine(line);
    if (cells.length !== headers.length) {
      errors.push({
        line: i + 1,
        reason: `expected ${headers.length} columns, found ${cells.length}`,
      });
      continue;
    }
    rows.push({ line: i + 1, cells });
  }

  if (!headerSeen) {
    errors.push({ line: 1, reason: 'file is empty' });
  }
  return { headers, rows, errors };
}
