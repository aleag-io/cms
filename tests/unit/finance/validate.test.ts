import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  isLedgerOwnerType,
  parseAccountCreate,
  parseDonationMethod,
  parseFundCreate,
  parseJournalCreate,
  parsePeriodCreate,
  requireCents,
  requireDate,
  requireUuid,
} from '@/lib/finance/validate';

const UUID = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';

describe('finance validate', () => {
  it('requireUuid accepts only UUIDs', () => {
    expect(requireUuid('id', UUID)).toBe(UUID);
    expect(() => requireUuid('id', 'nope')).toThrow(ApiError);
  });

  it('requireCents rejects non-positive', () => {
    expect(requireCents('a', '100')).toBe(BigInt(100));
    expect(() => requireCents('a', '0')).toThrow(/positive/);
    expect(() => requireCents('a', '-1')).toThrow(/positive/);
  });

  it('requireDate rejects invalid dates', () => {
    expect(requireDate('d', '2026-01-15').getFullYear()).toBe(2026);
    expect(() => requireDate('d', 'not-a-date')).toThrow(ApiError);
  });

  it('parseAccountCreate validates code and type', () => {
    expect(
      parseAccountCreate({ code: '1000', name: 'Cash', type: 'ASSET' }),
    ).toEqual({
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      fundId: null,
    });
    expect(() =>
      parseAccountCreate({ code: '!!!', name: 'x', type: 'ASSET' }),
    ).toThrow(/code/);
    expect(() =>
      parseAccountCreate({ code: '1', name: 'x', type: 'NOT_A_TYPE' }),
    ).toThrow(/type/);
  });

  it('parseFundCreate requires name', () => {
    expect(parseFundCreate({ name: ' Building ' })).toEqual({
      name: 'Building',
    });
    expect(() => parseFundCreate({})).toThrow(ApiError);
  });

  it('parseJournalCreate requires ≥2 lines and valid directions', () => {
    const body = {
      description: 'Offering',
      entryDate: '2026-06-01',
      periodId: UUID,
      submit: true,
      lines: [
        { accountId: UUID, direction: 'DEBIT', amountCents: '500' },
        { accountId: UUID2, direction: 'CREDIT', amountCents: '500' },
      ],
    };
    const parsed = parseJournalCreate(body);
    expect(parsed.submit).toBe(true);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0].amountCents).toBe(BigInt(500));

    expect(() =>
      parseJournalCreate({ ...body, lines: [body.lines[0]] }),
    ).toThrow(/at least 2/);
    expect(() =>
      parseJournalCreate({
        ...body,
        lines: [
          { accountId: UUID, direction: 'SIDEWAYS', amountCents: '1' },
          { accountId: UUID2, direction: 'CREDIT', amountCents: '1' },
        ],
      }),
    ).toThrow(/direction/);
  });

  it('parsePeriodCreate enforces date order', () => {
    expect(
      parsePeriodCreate({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }).endDate.getMonth(),
    ).toBe(11);
    expect(() =>
      parsePeriodCreate({
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      }),
    ).toThrow(/endDate/);
  });

  it('parseDonationMethod covers church methods', () => {
    for (const m of [
      'CASH',
      'CHECK',
      'ZELLE',
      'ACH',
      'CARD',
      'STOCK',
      'OTHER',
    ]) {
      expect(parseDonationMethod(m)).toBe(m);
    }
    expect(() => parseDonationMethod('BITCOIN')).toThrow(ApiError);
  });

  it('isLedgerOwnerType knows multi-level owners', () => {
    expect(isLedgerOwnerType('DIOCESE')).toBe(true);
    expect(isLedgerOwnerType('PARISH')).toBe(true);
    expect(isLedgerOwnerType('ORGANIZATION')).toBe(true);
    expect(isLedgerOwnerType('FUND')).toBe(false);
  });
});
