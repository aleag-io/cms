import type { Prisma, Role } from '@prisma/client';
import type { SessionClaims } from '@/lib/auth';
import type { LedgerRef } from '@/lib/finance/ledger-scope';

// R6 / M11 report framework.
// Report rows are FLAT records of display-ready cells so one CSV renderer, one
// PDF renderer, and the cross-cutting sensitive-field leak test can iterate
// every registry entry generically. Report internals stay typed; flattening
// (including money formatting) happens inside each definition's run().

export type ReportScope = 'parish' | 'diocese';

export type ReportFormat = 'json' | 'csv' | 'pdf';

export type ReportCell = string | number | null;

export type ReportColumn = {
  key: string;
  label: string;
  /** Drives alignment/formatting hints in renderers. Default 'text'. */
  kind?: 'text' | 'number' | 'money' | 'date';
};

export type ReportSection = {
  title?: string;
  rows: Record<string, ReportCell>[];
  totals?: Record<string, ReportCell>;
};

export type ReportResult = {
  columns: ReportColumn[];
  sections: ReportSection[];
  grandTotals?: Record<string, ReportCell>;
  meta: {
    title: string;
    subtitle?: string;
    generatedAt: string;
    params: Record<string, string>;
  };
};

export type ReportParamDef = {
  key: string;
  label: string;
  type: 'year' | 'dateRange' | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
};

export type ReportContext = {
  claims: SessionClaims;
  scope: ReportScope;
  dioceseId: string;
  parishId: string | null;
  /** Present when the definition declares needsLedgerOwner. */
  ledger?: LedgerRef;
};

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  category: 'people' | 'operations' | 'finance';
  scopes: ReportScope[];
  /** Roles allowed to run the report. Never includes MEMBER (PA-22 / D11). */
  roles: Role[];
  /** When true the API resolves ?owner= into ctx.ledger (finance reports). */
  needsLedgerOwner?: boolean;
  params: ReportParamDef[];
  run(
    tx: Prisma.TransactionClient,
    ctx: ReportContext,
    params: Record<string, string>,
  ): Promise<ReportResult>;
};
