import { cookies } from 'next/headers';
import { Role, type AppUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** HttpOnly cookie storing diocese-user parish work-context (shell plan §7). */
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

export async function readWorkingParishIdFromCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(WORKING_PARISH_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    // cookies() unavailable outside a request (tests)
    return null;
  }
}

/**
 * Resolve a valid working parish for a diocese-scoped actor.
 * Returns null if cookie missing, parish not in diocese, or actor is parish-home.
 */
export async function resolveWorkingParishId(
  user: Pick<AppUser, 'role' | 'dioceseId' | 'parishId'>,
): Promise<string | null> {
  if (isParishHomeRole(user.role)) return null;

  const candidate = await readWorkingParishIdFromCookie();
  if (!candidate) return null;

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
  user: Pick<AppUser, 'role' | 'dioceseId' | 'parishId'>,
): Promise<{ id: string; name: string } | null> {
  if (isParishHomeRole(user.role)) return null;

  const candidate = await readWorkingParishIdFromCookie();
  if (!candidate) return null;

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
 * diocese-scoped roles get parishId set to the working parish when valid.
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
