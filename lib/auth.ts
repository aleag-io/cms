import { Role, type AppUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Resolver seam — production default reads the Supabase session cookie.
// Tests override this via _setSessionResolver to inject a fixed user without
// going through Supabase Auth.
// ---------------------------------------------------------------------------

type SessionResolver = () => Promise<AppUser | null>;

let _resolver: SessionResolver = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { id: user.id } });
};

export function _setSessionResolver(fn: SessionResolver): () => void {
  const previous = _resolver;
  _resolver = fn;
  return () => {
    _resolver = previous;
  };
}

// ---------------------------------------------------------------------------
// Public API (used by route handlers and server components)
// ---------------------------------------------------------------------------

export async function getSessionUser(): Promise<AppUser | null> {
  return _resolver();
}

export async function requireSessionUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  return user;
}

export async function requireRole(roles: Role[]): Promise<AppUser> {
  const user = await requireSessionUser();
  if (!roles.includes(user.role)) throw new ApiError(403, 'Forbidden');
  return user;
}
