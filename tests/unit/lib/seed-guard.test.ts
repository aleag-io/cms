import { describe, expect, it } from 'vitest';
import { assertSeedTargetSafe } from '@/lib/seed-guard';

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
});
