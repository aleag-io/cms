import { describe, expect, it } from 'vitest';
import {
  assertSeedTargetSafe,
  describeSeedTarget,
  isProductionDbTarget,
  PROD_SUPABASE_PROJECT_REF,
} from '@/lib/seed-guard';

describe('assertSeedTargetSafe', () => {
  it('allows local hosts without a remote flag', () => {
    expect(() =>
      assertSeedTargetSafe('postgresql://postgres:postgres@127.0.0.1:54322/postgres', {}),
    ).not.toThrow();
    expect(() =>
      assertSeedTargetSafe('postgresql://postgres:postgres@localhost:54322/postgres', {}),
    ).not.toThrow();
  });

  it('refuses non-local hosts without opt-in', () => {
    expect(() =>
      assertSeedTargetSafe(
        'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
        {},
      ),
    ).toThrow(/Refusing to seed non-local/);
  });

  it('allows non-local hosts when SEED_ALLOW_REMOTE=1', () => {
    expect(() =>
      assertSeedTargetSafe(
        'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
        { SEED_ALLOW_REMOTE: '1' },
      ),
    ).not.toThrow();
  });

  it('allows non-local hosts when ALLOW_DEMO_SEED=1', () => {
    expect(() =>
      assertSeedTargetSafe(
        'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
        { ALLOW_DEMO_SEED: '1' },
      ),
    ).not.toThrow();
  });

  it('always refuses the production project ref even with SEED_ALLOW_REMOTE', () => {
    const prodUrl = `postgresql://postgres:secret@db.${PROD_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;
    expect(() =>
      assertSeedTargetSafe(prodUrl, { SEED_ALLOW_REMOTE: '1' }),
    ).toThrow(/production database/);
  });
});

describe('isProductionDbTarget', () => {
  it('detects production host', () => {
    expect(
      isProductionDbTarget(
        `postgresql://x@db.${PROD_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
      ),
    ).toBe(true);
  });

  it('does not flag preview-like hosts', () => {
    expect(
      isProductionDbTarget(
        'postgresql://x@db.fnvayegctruotqnutswv.supabase.co:5432/postgres',
      ),
    ).toBe(false);
  });
});

describe('describeSeedTarget', () => {
  it('returns hostname', () => {
    expect(
      describeSeedTarget('postgresql://u:p@127.0.0.1:54322/postgres'),
    ).toBe('127.0.0.1');
  });
});
