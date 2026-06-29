import { cookies } from 'next/headers';
import { Role, type AppUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE = 'cms_user_id';

// ---------------------------------------------------------------------------
// Resolver seam — production default reads the cookie; tests override this.
// Call _setSessionResolver() in your test setup before importing any route
// handler that calls getSessionUser(). Reset it to the default in afterEach.
// ---------------------------------------------------------------------------

type SessionResolver = () => Promise<AppUser | null>;

let _resolver: SessionResolver = async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.appUser.findUnique({ where: { id: userId } });
};

/** Override the session resolver in tests. Returns a reset function. */
export function _setSessionResolver(fn: SessionResolver): () => void {
  _resolver = fn;
  return () => {
    _resolver = async () => {
      const cookieStore = await cookies();
      const userId = cookieStore.get(SESSION_COOKIE)?.value;
      if (!userId) return null;
      return prisma.appUser.findUnique({ where: { id: userId } });
    };
  };
}

// ---------------------------------------------------------------------------
// Public API (used by route handlers)
// ---------------------------------------------------------------------------

export async function getSessionUser() {
  return _resolver();
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await requireSessionUser();
  if (!roles.includes(user.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

export async function setSessionUser(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionUser() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
