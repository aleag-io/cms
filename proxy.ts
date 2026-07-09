import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname === '/register' ||
    pathname === '/bootstrap' ||
    pathname === '/api-docs' ||
    pathname.startsWith('/api-docs/') ||
    pathname === '/api/bootstrap' ||
    // Public member self-registration intake (MM-8) — validated + rate-limited
    // in the handler; pending members are invisible until approved.
    pathname === '/api/registrations' ||
    // Public parish list for self-registration form.
    pathname === '/api/public/parishes' ||
    // Cron worker — guarded by a shared secret header, not user auth.
    pathname === '/api/jobs/process-communications' ||
    pathname === '/api/jobs/expire-sharing-requests' ||
    pathname === '/api/jobs/expire-emergency-access' ||
    pathname.startsWith('/api/shares/link/') ||
    // Public secure-link viewer page (token in path; no session required).
    pathname.startsWith('/share/')
  );
}

function unauthorizedOrLogin(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Missing env must not hang the request (CI smoke / misconfigured deploy).
  // Treat as unauthenticated; public routes still work.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isPublic) return unauthorizedOrLogin(request);
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Supabase client can hang or throw when Auth is down (e.g. CI without a
  // local stack). Fail closed as unauthenticated rather than stalling forever.
  let user: { id: string } | null = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth getUser timeout')), 3_000),
      ),
    ]);
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user && !isPublic) {
    return unauthorizedOrLogin(request);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
