import { afterEach, describe, expect, it } from 'vitest';
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from '@/lib/supabase/env';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL_OVERRIDE',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY_OVERRIDE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY_OVERRIDE',
] as const;

const saved = new Map(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('supabase env resolution', () => {
  it('prefers the *_OVERRIDE variable when set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://base.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL_OVERRIDE =
      'https://override.supabase.co';
    expect(supabaseUrl()).toBe('https://override.supabase.co');
  });

  it('falls back to the base variable when no override is set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://base.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL_OVERRIDE;
    expect(supabaseUrl()).toBe('https://base.supabase.co');
  });

  it('applies the same precedence to the anon key and service-role key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'base-anon';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_OVERRIDE = 'override-anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'base-svc';
    process.env.SUPABASE_SERVICE_ROLE_KEY_OVERRIDE = 'override-svc';
    expect(supabaseAnonKey()).toBe('override-anon');
    expect(supabaseServiceRoleKey()).toBe('override-svc');

    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_OVERRIDE;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY_OVERRIDE;
    expect(supabaseAnonKey()).toBe('base-anon');
    expect(supabaseServiceRoleKey()).toBe('base-svc');
  });
});
