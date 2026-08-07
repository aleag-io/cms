import { describe, expect, it } from 'vitest';
import {
  financeFullParishLimit,
  resolveSeedProfile,
} from '@/lib/seed-profile';

describe('resolveSeedProfile', () => {
  it('defaults to local', () => {
    const p = resolveSeedProfile({});
    expect(p.name).toBe('local');
    expect(p.familyMultiplier).toBe(1);
    expect(p.financeFullParishes).toBe(3);
    expect(p.batchMonths).toBe(1);
  });

  it('resolves demo denser defaults', () => {
    const p = resolveSeedProfile({ SEED_PROFILE: 'demo' });
    expect(p.name).toBe('demo');
    expect(p.familyMultiplier).toBe(2);
    expect(p.financeFullParishes).toBe('all');
    expect(p.batchMonths).toBe(12);
    expect(p.pendingApprovals).toBe(true);
  });

  it('applies numeric overrides', () => {
    const p = resolveSeedProfile({
      SEED_PROFILE: 'demo',
      SEED_FAMILY_MULTIPLIER: '3',
      SEED_BATCH_MONTHS: '6',
      SEED_FINANCE_FULL_PARISHES: '4',
      SEED_SECONDARY_FRACTION: '0.1',
    });
    expect(p.familyMultiplier).toBe(3);
    expect(p.batchMonths).toBe(6);
    expect(p.financeFullParishes).toBe(4);
    expect(p.secondaryMemberFraction).toBe(0.1);
  });

  it('accepts finance full=all override on local', () => {
    const p = resolveSeedProfile({
      SEED_PROFILE: 'local',
      SEED_FINANCE_FULL_PARISHES: 'all',
    });
    expect(p.financeFullParishes).toBe('all');
  });
});

describe('financeFullParishLimit', () => {
  it('caps at parish count for all', () => {
    const p = resolveSeedProfile({ SEED_PROFILE: 'demo' });
    expect(financeFullParishLimit(p, 10)).toBe(10);
  });

  it('uses numeric limit', () => {
    const p = resolveSeedProfile({
      SEED_PROFILE: 'local',
      SEED_FINANCE_FULL_PARISHES: '3',
    });
    expect(financeFullParishLimit(p, 10)).toBe(3);
  });
});
