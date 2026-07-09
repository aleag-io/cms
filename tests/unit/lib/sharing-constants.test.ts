import { describe, expect, it } from 'vitest';
import {
  DATA_CATEGORIES,
  formatDateTime,
  isExpired,
  labelDataCategory,
} from '@/lib/sharing/constants';

describe('sharing constants', () => {
  it('labels known categories and falls back for unknown', () => {
    expect(labelDataCategory('MEMBER_DIRECTORY')).toBe('Member directory');
    expect(labelDataCategory('NOT_A_REAL_CATEGORY')).toBe('NOT_A_REAL_CATEGORY');
  });

  it('includes the API-accepted category set', () => {
    expect(DATA_CATEGORIES).toContain('MEMBER_DIRECTORY');
    expect(DATA_CATEGORIES).toContain('AUDIT_LOG');
    expect(DATA_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });

  it('detects expired timestamps', () => {
    expect(isExpired(new Date(Date.now() - 60_000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
    expect(isExpired(null)).toBe(false);
  });

  it('formats dates safely', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDateTime(new Date('2026-01-15T12:00:00Z'))).not.toBe('—');
  });
});
