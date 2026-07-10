import { describe, expect, it } from 'vitest';
import {
  parseLiturgicalCreate,
  parseLiturgicalPatch,
} from '@/lib/liturgical/validate';
import { ApiError } from '@/lib/api';

describe('parseLiturgicalCreate', () => {
  it('parses a minimal body with defaults', () => {
    const input = parseLiturgicalCreate({ title: ' Denaha ' });
    expect(input).toEqual({
      title: 'Denaha',
      observanceType: 'FEAST',
      month: null,
      day: null,
      occursOn: null,
      endsOn: null,
      lectionaryRef: null,
      isPublished: true,
    });
  });

  it('accepts valid month/day and dates', () => {
    const input = parseLiturgicalCreate({
      title: 'X',
      observanceType: 'HOLY_DAY',
      month: 12,
      day: 31,
      occursOn: '2026-12-25',
      isPublished: false,
    });
    expect(input.month).toBe(12);
    expect(input.day).toBe(31);
    expect(input.occursOn?.toISOString().slice(0, 10)).toBe('2026-12-25');
    expect(input.isPublished).toBe(false);
  });

  it.each([
    [{ title: '' }],
    [{ title: 'X', month: 0 }],
    [{ title: 'X', month: 13 }],
    [{ title: 'X', day: 32 }],
    [{ title: 'X', day: 1.5 }],
    [{ title: 'X', observanceType: 'BOGUS' }],
    [{ title: 'X', occursOn: 'not-a-date' }],
    [{ title: 'X', endsOn: 42 }],
  ])('rejects %j', (body) => {
    expect(() => parseLiturgicalCreate(body as Record<string, unknown>)).toThrow(
      ApiError,
    );
  });
});

describe('parseLiturgicalPatch', () => {
  it('only includes provided keys', () => {
    expect(parseLiturgicalPatch({})).toEqual({});
    expect(parseLiturgicalPatch({ month: null, isPublished: true })).toEqual({
      month: null,
      isPublished: true,
    });
  });

  it('rejects invalid partial values', () => {
    expect(() => parseLiturgicalPatch({ title: '  ' })).toThrow(ApiError);
    expect(() => parseLiturgicalPatch({ observanceType: 'NOPE' })).toThrow(
      ApiError,
    );
    expect(() => parseLiturgicalPatch({ isPublished: 'yes' })).toThrow(ApiError);
  });
});
