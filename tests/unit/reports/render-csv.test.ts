import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reportToCsv } from '@/lib/reports/render-csv';
import type { ReportResult } from '@/lib/reports/types';

const result: ReportResult = {
  columns: [
    { key: 'item', label: 'Item' },
    { key: 'amount', label: 'Amount', kind: 'money' },
  ],
  sections: [
    {
      title: 'B. Church Operation',
      rows: [
        { item: 'Subscription', amount: '$1,000.00' },
        { item: '=SUM(A1:A9)', amount: '$2.00' },
      ],
      totals: { item: null, amount: '$1,002.00' },
    },
  ],
  grandTotals: { item: null, amount: '$1,002.00' },
  meta: { title: 'Test', generatedAt: '2026-07-17', params: {} },
};

describe('reportToCsv', () => {
  it('renders headers, section titles, rows, totals', () => {
    const csv = reportToCsv(result);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Item,Amount');
    expect(lines[1]).toBe('B. Church Operation');
    expect(lines[2]).toBe('Subscription,"$1,000.00"');
    expect(csv).toContain('Total');
    expect(csv).toContain('Grand total');
  });

  it('neutralizes formula injection coming from report data', () => {
    const csv = reportToCsv(result);
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).not.toMatch(/^=SUM/m);
  });
});

describe('render-pdf isolation invariant', () => {
  it('render-pdf imports no data-layer modules (leak-gate design D5)', () => {
    const source = readFileSync('lib/reports/render-pdf.tsx', 'utf8');
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/@\/lib\/prisma/);
    expect(source).not.toMatch(/@\/lib\/db\/withTenant/);
    expect(source).not.toMatch(/process\.env/);
  });
});
