import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { formatCents } from '@/lib/finance/money';
import type { ComputedStatement } from '@/lib/finance/statements';

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 18, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 10, color: '#555', marginBottom: 16 },
  meta: { marginBottom: 16 },
  row: { flexDirection: 'row', borderBottom: '1 solid #eee', paddingVertical: 4 },
  headRow: { flexDirection: 'row', borderBottom: '1.5 solid #333', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  cDate: { width: '22%' },
  cFund: { width: '38%' },
  cMethod: { width: '20%' },
  cAmount: { width: '20%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', marginTop: 8, paddingTop: 6, borderTop: '1.5 solid #333' },
  totalLabel: { width: '80%', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalAmount: { width: '20%', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  boiler: { marginTop: 24, fontSize: 9, color: '#555', lineHeight: 1.4 },
});

export type StatementPdfInput = {
  parishName: string;
  statement: ComputedStatement;
};

function StatementDoc({ parishName, statement }: StatementPdfInput) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>{parishName}</Text>
        <Text style={styles.sub}>Annual Contribution Statement — Tax Year {statement.taxYear}</Text>
        <View style={styles.meta}>
          <Text>Recipient: {statement.recipientName}</Text>
        </View>

        <View style={styles.headRow}>
          <Text style={styles.cDate}>Date</Text>
          <Text style={styles.cFund}>Fund</Text>
          <Text style={styles.cMethod}>Method</Text>
          <Text style={styles.cAmount}>Amount</Text>
        </View>
        {statement.lineItems.map((l, i) => (
          <View style={styles.row} key={i}>
            <Text style={styles.cDate}>{l.date}</Text>
            <Text style={styles.cFund}>{l.fundName}</Text>
            <Text style={styles.cMethod}>{l.method}</Text>
            <Text style={styles.cAmount}>{formatCents(l.amountCents)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total contributions</Text>
          <Text style={styles.totalAmount}>{formatCents(statement.totalCents)}</Text>
        </View>

        <Text style={styles.boiler}>
          No goods or services were provided in exchange for these contributions
          other than intangible religious benefits. Please retain this statement
          for your tax records. Consult your tax advisor regarding deductibility.
        </Text>
      </Page>
    </Document>
  );
}

/** Render a giving statement to PDF bytes (pure JS, no headless browser). */
export function renderStatementPdf(input: StatementPdfInput): Promise<Buffer> {
  return renderToBuffer(<StatementDoc {...input} />);
}
