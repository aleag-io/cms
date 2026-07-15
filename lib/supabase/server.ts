import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from './env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl()!,
    supabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export function createSupabaseAdminClient() {
  return createClient(
    supabaseUrl()!,
    supabaseServiceRoleKey()!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
