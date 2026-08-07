import { cookies } from 'next/headers';
import { Role, type AppUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** HttpOnly cookie storing the parish work-context (shell plan §7). Shared by
 *  diocese-scoped actors (work-in-parish mode) and multi-parish members
 *  (MM-17 working-parish focus). */
export const WORKING_PARISH_COOKIE = 'cms_working_parish_id';

export const DIOCESE_SCOPED_ROLES: Role[] = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.DIOCESE_REPORT_VIEWER,
];

export function isDioceseScopedRole(role: Role | string): boolean {
  const r = typeof role === 'string' ? role.toUpperCase() : role;
  return (DIOCESE_SCOPED_ROLES as string[]).includes(r);
}

export function isParishHomeRole(role: Role | string): boolean {
  return !isDioceseScopedRole(role);
}

/** Portal for nav/dashboard: parish-only vs diocese-wide. */
export type PortalMode = 'parish' | 'diocese';

export function portalForUser(
  user: Pick<AppUser, 'role' | 'parishId'>,
  workingParishId: string | null,
): PortalMode {
  if (isParishHomeRole(user.role)) return 'parish';
  if (workingParishId) return 'parish';
  return 'diocese';
}

// ---------------------------------------------------------------------------
// Cookie read seam — production reads next/headers; integration tests inject
// a fixed value so route handlers can run without a Next request scope
// (same pattern as _setSessionResolver in lib/auth.ts).
// ---------------------------------------------------------------------------

type WorkingParishCookieReader = () => Promise<string | null>;

const _defaultCookieReader: WorkingParishCookieReader = async () => {
  try {
    const store = await cookies();
    const value = store.get(WORKING_PARISH_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    // cookies() unavailable outside a request
    return null;
  }
};

let _cookieReader: WorkingParishCookieReader = _defaultCookieReader;

export function _setWorkingParishCookieReader(
  fn: WorkingParishCookieReader | null,
): () => void {
  const previous = _cookieReader;
  _cookieReader = fn ?? _defaultCookieReader;
  return () => {
    _cookieReader = previous;
  };
}

export function readWorkingParishIdFromCookie(): Promise<string | null> {
  return _cookieReader();
}

/** Resolve the Member row linked to an AppUser, if any (MM-17 membership).
 *  Single indexed lookup on Member.userId. */
async function memberIdForAppUser(userId: string): Promise<string | null> {
  const member = await prisma.member.findFirst({
    where: { userId },
    select: { id: true },
  });
  return member?.id ?? null;
}

/** Active MemberParish memberships for a member (working-parish choices). */
export async function memberWorkingParishChoices(
  memberId: string,
): Promise<{ id: string; name: string; isPrimary: boolean }[]> {
  const rows = await prisma.memberParish.findMany({
    where: { memberId, parish: { isActive: true } },
    select: {
      isPrimary: true,
      parish: { select: { id: true, name: true } },
    },
    orderBy: [{ isPrimary: 'desc' }, { parish: { name: 'asc' } }],
  });
  return rows.map((row) => ({
    id: row.parish.id,
    name: row.parish.name,
    isPrimary: row.isPrimary,
  }));
}

/**
 * Validate a working-parish candidate for a parish-home actor: valid iff the
 * actor's linked Member holds a MemberParish row for that parish (the parish
 * must also be active). Members can never focus a parish they do not belong to.
 */
export async function resolveMemberWorkingParish(
  user: Pick<AppUser, 'id'>,
  candidateParishId: string,
): Promise<{ id: string; name: string } | null> {
  const memberId = await memberIdForAppUser(user.id);
  if (!memberId) return null;

  const row = await prisma.memberParish.findFirst({
    where: {
      memberId,
      parishId: candidateParishId,
      parish: { isActive: true },
    },
    select: { parish: { select: { id: true, name: true } } },
  });
  return row?.parish ?? null;
}

/**
 * Resolve a valid working parish for any actor.
 * - Diocese-scoped roles: parish must be active and inside their diocese.
 * - Parish-home roles: parish must be one of their MemberParish memberships.
 * Returns null when the cookie is absent or the candidate is not valid.
 */
export async function resolveWorkingParishId(
  user: Pick<AppUser, 'id' | 'role' | 'dioceseId' | 'parishId'>,
): Promise<string | null> {
  const candidate = await readWorkingParishIdFromCookie();
  if (!candidate) return null;

  if (isParishHomeRole(user.role)) {
    const parish = await resolveMemberWorkingParish(user, candidate);
    return parish?.id ?? null;
  }

  const parish = await prisma.parish.findFirst({
    where: {
      id: candidate,
      dioceseId: user.dioceseId,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  return parish?.id ?? null;
}

export async function resolveWorkingParish(
  user: Pick<AppUser, 'id' | 'role' | 'dioceseId' | 'parishId'>,
): Promise<{ id: string; name: string } | null> {
  const candidate = await readWorkingParishIdFromCookie();
  if (!candidate) return null;

  if (isParishHomeRole(user.role)) {
    return resolveMemberWorkingParish(user, candidate);
  }

  return prisma.parish.findFirst({
    where: {
      id: candidate,
      dioceseId: user.dioceseId,
      isActive: true,
    },
    select: { id: true, name: true },
  });
}

/**
 * Apply parish work-context onto the AppUser used by APIs:
 * the actor's effective parishId is set to the working parish when valid.
 * AppUser.role is never mutated.
 */
export async function withWorkingParishScope(user: AppUser): Promise<AppUser> {
  const workingId = await resolveWorkingParishId(user);
  if (!workingId) return user;
  if (user.parishId === workingId) return user;
  return { ...user, parishId: workingId };
}

/**
 * Roles a diocese-scoped actor may satisfy while in parish work-context.
 * Does not mutate AppUser.role — only expands requireRole checks.
 */
export function elevatedRolesForWorkContext(role: Role): Role[] {
  switch (role) {
    case Role.GLOBAL_ADMIN:
    case Role.DIOCESE_ADMIN:
      return [
        Role.PARISH_ADMIN,
        Role.PARISH_STAFF,
        Role.PARISH_DATA_SHARING_MANAGER,
        Role.MEMBER,
      ];
    case Role.DIOCESE_STAFF:
      return [Role.PARISH_STAFF, Role.MEMBER];
    case Role.DIOCESE_REPORT_VIEWER:
      // Read-oriented surfaces that allow MEMBER (or shared read roles)
      return [Role.MEMBER];
    default:
      return [];
  }
}
