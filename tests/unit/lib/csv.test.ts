import { describe, it, expect } from 'vitest';
import { escapeCsvCell, toCsv, parseCsv } from '@/lib/csv';

describe('escapeCsvCell', () => {
  it('passes plain values through', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('renders null/undefined as empty string', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('neutralizes spreadsheet formula injection', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(
      '"\'=HYPERLINK(""http://evil"")"',
    );
    expect(escapeCsvCell('=1+2')).toBe("'=1+2");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });

  it('quotes cells containing commas, quotes, and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toCsv', () => {
  it('renders headers and rows', () => {
    const csv = toCsv(
      ['Name', 'Amount'],
      [
        ['Alice', 100],
        ['Bob, Jr.', 200],
      ],
    );
    expect(csv).toBe('Name,Amount\nAlice,100\n"Bob, Jr.",200');
  });

  it('neutralizes formula cells in rows', () => {
    const csv = toCsv(['A'], [['=SUM(1)']]);
    expect(csv).toContain("'=SUM(1)");
  });
});

describe('parseCsv', () => {
  it('parses a simple file with CRLF endings', () => {
    const { headers, rows, errors } = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    expect(headers).toEqual(['a', 'b']);
    expect(rows.map((r) => r.cells)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
    expect(errors).toEqual([]);
  });

  it('handles quoted commas and escaped quotes', () => {
    const { rows } = parseCsv('name,notes\n"Smith, John","said ""hello"""');
    expect(rows[0].cells).toEqual(['Smith, John', 'said "hello"']);
  });

  it('skips blank lines while keeping original line numbers', () => {
    const { rows } = parseCsv('h1\nv1\n\nv2\n');
    expect(rows.map((r) => ({ line: r.line, cells: r.cells }))).toEqual([
      { line: 2, cells: ['v1'] },
      { line: 4, cells: ['v2'] },
    ]);
  });

  it('reports column-count mismatches as row errors', () => {
    const { rows, errors } = parseCsv('a,b\n1,2\nonly-one\n3,4');
    expect(rows.map((r) => r.cells)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(errors).toEqual([
      { line: 3, reason: 'expected 2 columns, found 1' },
    ]);
  });

  it('returns an error for an empty file', () => {
    const { headers, rows, errors } = parseCsv('   \n  ');
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ line: 1, reason: 'file is empty' }]);
  });
});
