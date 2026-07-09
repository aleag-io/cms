import { describe, expect, it } from 'vitest';
import {
  DATA_CATEGORIES,
  formatDateTime,
  isExpired,
  labelDataCategory,
  shareLifecycleStatus,
} from '@/lib/sharing/constants';
import { publicShare } from '@/lib/sharing/public-share';
import { anonymizeResource } from '@/lib/sharing/anonymize';

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

describe('shareLifecycleStatus', () => {
  it('returns revoked when inactive', () => {
    expect(
      shareLifecycleStatus({ isActive: false, maxViews: 5, viewCount: 0 }),
    ).toBe('revoked');
  });

  it('returns expired when past expiresAt', () => {
    expect(
      shareLifecycleStatus({
        isActive: true,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe('expired');
  });

  it('returns exhausted when viewCount >= maxViews', () => {
    expect(
      shareLifecycleStatus({
        isActive: true,
        maxViews: 2,
        viewCount: 2,
      }),
    ).toBe('exhausted');
  });

  it('returns active when within limits', () => {
    expect(
      shareLifecycleStatus({
        isActive: true,
        maxViews: 3,
        viewCount: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe('active');
  });
});

describe('publicShare', () => {
  it('strips tokenHash from responses', () => {
    const out = publicShare({
      id: 's1',
      tokenHash: 'abc123',
      shareMode: 'SECURE_LINK',
    });
    expect(out).not.toHaveProperty('tokenHash');
    expect(out).toMatchObject({ id: 's1', shareMode: 'SECURE_LINK' });
  });
});

describe('anonymizeResource for secure-link viewer payload', () => {
  it('never leaves direct identifiers on anonymized member_list', () => {
    const out = anonymizeResource({
      type: 'member_list',
      members: [
        {
          id: 'm1',
          memberIdentifier: '100.1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'a@test.local',
          phone: '555',
          status: 'ACTIVE',
        },
      ],
    });
    const members = out.members as Array<Record<string, unknown>>;
    expect(members[0]).not.toHaveProperty('firstName');
    expect(members[0]).not.toHaveProperty('email');
    expect(members[0]).toHaveProperty('status', 'ACTIVE');
  });
});
