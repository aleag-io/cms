import type {
  AccountType,
  DonationMethod,
  JournalDirection,
  LedgerOwnerType,
} from '@prisma/client';
import { ApiError } from '@/lib/api';
import { centsFromJson } from '@/lib/finance/money';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCOUNT_TYPES = new Set<AccountType>([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
]);

const DIRECTIONS = new Set<JournalDirection>(['DEBIT', 'CREDIT']);

const DONATION_METHODS = new Set<DonationMethod>([
  'CASH',
  'CHECK',
  'ZELLE',
  'ACH',
  'CARD',
  'STOCK',
  'OTHER',
]);

const OWNER_TYPES = new Set<LedgerOwnerType>([
  'DIOCESE',
  'PARISH',
  'ORGANIZATION',
]);

export function requireUuid(key: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ApiError(400, `${key} must be a UUID`);
  }
  return value;
}

export function optionalUuid(key: string, value: unknown): string | null {
  if (value == null || value === '') return null;
  return requireUuid(key, value);
}

export function requireNonEmptyString(key: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${key} is required`);
  }
  return value.trim();
}

export function requireDate(key: string, value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${key} is required`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `${key} must be a date`);
  return d;
}

export function requireCents(key: string, value: unknown): bigint {
  try {
    const c = centsFromJson(value as string | number);
    if (c <= BigInt(0)) throw new ApiError(400, `${key} must be positive cents`);
    return c;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, `${key} must be integer cents`);
  }
}

export function parseAccountCreate(body: Record<string, unknown>) {
  const code = requireNonEmptyString('code', body.code);
  if (!/^[A-Za-z0-9.\-]{1,32}$/.test(code)) {
    throw new ApiError(400, 'code must be 1–32 alphanumeric characters');
  }
  const name = requireNonEmptyString('name', body.name);
  const typeRaw = body.type;
  if (typeof typeRaw !== 'string' || !ACCOUNT_TYPES.has(typeRaw as AccountType)) {
    throw new ApiError(400, 'type must be ASSET|LIABILITY|EQUITY|INCOME|EXPENSE');
  }
  return {
    code,
    name,
    type: typeRaw as AccountType,
    fundId: optionalUuid('fundId', body.fundId),
  };
}

export function parseFundCreate(body: Record<string, unknown>) {
  return { name: requireNonEmptyString('name', body.name) };
}

export function parseJournalCreate(body: Record<string, unknown>) {
  const description = requireNonEmptyString('description', body.description);
  const entryDate = requireDate('entryDate', body.entryDate);
  const periodId = requireUuid('periodId', body.periodId);
  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length < 2) {
    throw new ApiError(400, 'lines must be an array with at least 2 items');
  }
  const lines = linesRaw.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new ApiError(400, `lines[${i}] invalid`);
    }
    const row = raw as Record<string, unknown>;
    const direction = row.direction;
    if (typeof direction !== 'string' || !DIRECTIONS.has(direction as JournalDirection)) {
      throw new ApiError(400, `lines[${i}].direction must be DEBIT|CREDIT`);
    }
    return {
      accountId: requireUuid(`lines[${i}].accountId`, row.accountId),
      direction: direction as JournalDirection,
      amountCents: requireCents(`lines[${i}].amountCents`, row.amountCents),
      memo:
        typeof row.memo === 'string' && row.memo.trim()
          ? row.memo.trim()
          : undefined,
    };
  });
  const submit = body.submit === true || body.status === 'POSTED';
  return {
    description,
    entryDate,
    periodId,
    reference:
      typeof body.reference === 'string' ? body.reference.trim() || null : null,
    cashImpact: body.cashImpact !== false,
    submit,
    lines,
  };
}

export function parsePeriodCreate(body: Record<string, unknown>) {
  const startDate = requireDate('startDate', body.startDate);
  const endDate = requireDate('endDate', body.endDate);
  if (endDate < startDate) {
    throw new ApiError(400, 'endDate must be on or after startDate');
  }
  return { startDate, endDate };
}

export function parseDonationMethod(value: unknown): DonationMethod {
  if (typeof value !== 'string' || !DONATION_METHODS.has(value as DonationMethod)) {
    throw new ApiError(
      400,
      'method must be CASH|CHECK|ZELLE|ACH|CARD|STOCK|OTHER',
    );
  }
  return value as DonationMethod;
}

export function isLedgerOwnerType(v: string): v is LedgerOwnerType {
  return OWNER_TYPES.has(v as LedgerOwnerType);
}
