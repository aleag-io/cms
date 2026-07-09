/** Data categories accepted by sharing request / grant APIs. */
export const DATA_CATEGORIES = [
  'MEMBER_DIRECTORY',
  'MEMBER_DEMOGRAPHICS_DETAIL',
  'FAMILY_RECORDS',
  'SACRAMENTAL_RECORDS',
  'GIVING_DETAIL',
  'GIVING_STATEMENTS',
  'PROGRAM_ROSTER',
  'FINANCIAL_STATEMENTS',
  'LEDGER_DETAIL',
  'ATTENDANCE_DETAIL',
  'AUDIT_LOG',
  'COMMUNICATIONS_HISTORY',
] as const;

export type DataCategoryCode = (typeof DATA_CATEGORIES)[number];

export const DATA_CATEGORY_LABELS: Record<DataCategoryCode, string> = {
  MEMBER_DIRECTORY: 'Member directory',
  MEMBER_DEMOGRAPHICS_DETAIL: 'Member demographics (detail)',
  FAMILY_RECORDS: 'Family records',
  SACRAMENTAL_RECORDS: 'Sacramental records',
  GIVING_DETAIL: 'Giving detail',
  GIVING_STATEMENTS: 'Giving statements',
  PROGRAM_ROSTER: 'Program roster',
  FINANCIAL_STATEMENTS: 'Financial statements',
  LEDGER_DETAIL: 'Ledger detail',
  ATTENDANCE_DETAIL: 'Attendance detail',
  AUDIT_LOG: 'Audit log',
  COMMUNICATIONS_HISTORY: 'Communications history',
};

export function labelDataCategory(code: string): string {
  return DATA_CATEGORY_LABELS[code as DataCategoryCode] ?? code;
}

export const SHARE_RESOURCE_TYPES = [
  { value: 'member_list', label: 'Active member directory (list)' },
  { value: 'member', label: 'Single member profile' },
] as const;

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function isExpired(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.getTime() <= Date.now();
}
