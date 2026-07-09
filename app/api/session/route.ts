import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WORKING_PARISH_COOKIE } from '@/lib/context/working-parish';

export async function GET() {
  const user = await getSessionUser();
  return Response.json({ ok: true, user: user ?? null });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Drop parish work-context so the next login starts in the default portal.
  const store = await cookies();
  store.set(WORKING_PARISH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
