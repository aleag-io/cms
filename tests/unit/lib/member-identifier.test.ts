import { describe, it, expect } from 'vitest';
import {
  formatFamilyNumber,
  deriveMemberIdentifier,
  parseMemberIdentifier,
} from '@/lib/member-identifier';

describe('formatFamilyNumber', () => {
  it('zero-pads to the configured digit width', () => {
    expect(formatFamilyNumber(42, { prefix: '', digitWidth: 4, startAt: 1 })).toBe('0042');
  });

  it('prepends the prefix', () => {
    expect(formatFamilyNumber(7, { prefix: 'PAR-', digitWidth: 3, startAt: 1 })).toBe('PAR-007');
  });

  it('does not truncate numbers wider than digitWidth', () => {
    expect(formatFamilyNumber(10000, { prefix: '', digitWidth: 3, startAt: 1 })).toBe('10000');
  });

  it('handles no prefix and width 1', () => {
    expect(formatFamilyNumber(5, { prefix: '', digitWidth: 1, startAt: 1 })).toBe('5');
  });
});

describe('deriveMemberIdentifier', () => {
  it('combines family number and index with a dot', () => {
    expect(deriveMemberIdentifier('100', 1)).toBe('100.1');
    expect(deriveMemberIdentifier('100', 3)).toBe('100.3');
  });

  it('works with prefixed family numbers', () => {
    expect(deriveMemberIdentifier('PAR-042', 2)).toBe('PAR-042.2');
  });

  it('throws for index < 1', () => {
    expect(() => deriveMemberIdentifier('100', 0)).toThrow(RangeError);
    expect(() => deriveMemberIdentifier('100', -1)).toThrow(RangeError);
  });
});

describe('parseMemberIdentifier', () => {
  it('round-trips a standard identifier', () => {
    const parsed = parseMemberIdentifier('100.2');
    expect(parsed).toEqual({ familyNumber: '100', index: 2 });
  });

  it('round-trips a prefixed identifier', () => {
    const parsed = parseMemberIdentifier('PAR-042.3');
    expect(parsed).toEqual({ familyNumber: 'PAR-042', index: 3 });
  });

  it('returns null for a string with no dot', () => {
    expect(parseMemberIdentifier('1002')).toBeNull();
  });

  it('returns null when index part is not a positive integer', () => {
    expect(parseMemberIdentifier('100.0')).toBeNull();
    expect(parseMemberIdentifier('100.abc')).toBeNull();
    expect(parseMemberIdentifier('100.-1')).toBeNull();
  });
});
