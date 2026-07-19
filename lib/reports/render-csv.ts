import { escapeCsvCell } from '@/lib/csv';
import type { ReportResult } from './types';

/** Renders a ReportResult to CSV. Section titles/totals become labeled rows. */
export function reportToCsv(result: ReportResult): string {
  const keys = result.columns.map((c) => c.key);
  const lines: string[] = [
    result.columns.map((c) => escapeCsvCell(c.label)).join(','),
  ];

  const pushRecord = (record: Record<string, unknown>, label?: string) => {
    const cells = keys.map((key, i) => {
      const value = record[key];
      if (i === 0 && label !== undefined && (value === undefined || value === null)) {
        return escapeCsvCell(label);
      }
      return escapeCsvCell(
        value === undefined || value === null
          ? ''
          : (value as string | number),
      );
    });
    lines.push(cells.join(','));
  };

  for (const section of result.sections) {
    if (section.title) {
      lines.push(escapeCsvCell(section.title));
    }
    for (const row of section.rows) pushRecord(row);
    if (section.totals) pushRecord(section.totals, 'Total');
  }
  if (result.grandTotals) pushRecord(result.grandTotals, 'Grand total');

  return lines.join('\n');
}
