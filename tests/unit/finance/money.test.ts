import { describe, expect, it } from 'vitest';
import {
  centsFromJson,
  centsToJson,
  formatCents,
  parseCentsInput,
} from '@/lib/finance/money';

describe('finance money helpers', () => {
  it('formats cents as USD', () => {
    expect(formatCents(BigInt(0))).toBe('$0.00');
    expect(formatCents(BigInt(1234))).toBe('$12.34');
    expect(formatCents(BigInt(-50))).toBe('-$0.50');
    expect(formatCents(9007199254740993n)).toBe('$90,071,992,547,409.93');
  });

  it('parses dollar strings to cents', () => {
    expect(parseCentsInput('12.34')).toBe(BigInt(1234));
    expect(parseCentsInput('$1,234.56')).toBe(BigInt(123456));
    expect(parseCentsInput('10')).toBe(BigInt(1000));
    expect(parseCentsInput('-5.00')).toBe(BigInt(-500));
  });

  it('rejects fractional cents and garbage', () => {
    expect(() => parseCentsInput('1.234')).toThrow();
    expect(() => parseCentsInput('abc')).toThrow();
  });

  it('round-trips json cents', () => {
    expect(centsFromJson(centsToJson(BigInt(999999999999)))).toBe(BigInt(999999999999));
    expect(centsFromJson('42')).toBe(BigInt(42));
    expect(() => centsFromJson(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/);
    expect(() => centsFromJson('9223372036854775808')).toThrow(/BIGINT range/);
  });
});
