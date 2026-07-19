import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { ReportCell, ReportColumn, ReportResult } from './types';

// INVARIANT (leak-gate design, D5): this module renders ONLY a ReportResult —
// it must never import prisma or any data-layer module. The sensitive-field
// leak test scans the JSON ReportResult; that scan covers the PDF because
// nothing else can reach the page.

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 16, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#555', marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 4,
  },
  headRow: {
    flexDirection: 'row',
    borderBottom: '1.5 solid #333',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #eee',
    paddingVertical: 3,
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderTop: '1 solid #333',
    fontFamily: 'Helvetica-Bold',
  },
  grandTotalRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingVertical: 5,
    borderTop: '1.5 solid #111',
    fontFamily: 'Helvetica-Bold',
  },
});

function cellStyle(column: ReportColumn, count: number) {
  return {
    width: `${100 / count}%`,
    textAlign:
      column.kind === 'money' || column.kind === 'number'
        ? ('right' as const)
        : ('left' as const),
  };
}

function cellText(value: ReportCell | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function Row({
  record,
  columns,
  style,
  firstCellFallback,
}: {
  record: Record<string, ReportCell>;
  columns: ReportColumn[];
  style: ReturnType<typeof StyleSheet.create>[string];
  firstCellFallback?: string;
}) {
  return (
    <View style={style}>
      {columns.map((column, i) => (
        <Text key={column.key} style={cellStyle(column, columns.length)}>
          {i === 0 && record[column.key] == null && firstCellFallback
            ? firstCellFallback
            : cellText(record[column.key])}
        </Text>
      ))}
    </View>
  );
}

function ReportDoc({ result }: { result: ReportResult }) {
  const { columns, sections, grandTotals, meta } = result;
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>{meta.title}</Text>
        <Text style={styles.sub}>
          {meta.subtitle ? `${meta.subtitle} — ` : ''}Generated {meta.generatedAt}
        </Text>

        <View style={styles.headRow}>
          {columns.map((column) => (
            <Text key={column.key} style={cellStyle(column, columns.length)}>
              {column.label}
            </Text>
          ))}
        </View>

        {sections.map((section, sIdx) => (
          <View key={sIdx}>
            {section.title ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null}
            {section.rows.map((row, rIdx) => (
              <Row key={rIdx} record={row} columns={columns} style={styles.row} />
            ))}
            {section.totals ? (
              <Row
                record={section.totals}
                columns={columns}
                style={styles.totalRow}
                firstCellFallback="Total"
              />
            ) : null}
          </View>
        ))}

        {grandTotals ? (
          <Row
            record={grandTotals}
            columns={columns}
            style={styles.grandTotalRow}
            firstCellFallback="Grand total"
          />
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderReportPdf(result: ReportResult): Promise<Buffer> {
  return renderToBuffer(<ReportDoc result={result} />);
}
