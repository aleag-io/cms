import { Role, type AppUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// SessionClaims — the shape written into request.jwt.claims by withTenant()
// and injected into the JWT by the Supabase access-token hook in production.
// Matches architecture §4.2 / access-control §6.1.
// ---------------------------------------------------------------------------

export interface SessionClaims {
  sub: string;
  app_metadata: {
    diocese_id: string;
    parish_id: string | null;
    roles: string[];
    member_id: string | null;
    clergy_parish_ids: string[];
  };
}

// ---------------------------------------------------------------------------
// Resolver seam — production default reads the Supabase session cookie.
// Tests override this via _setSessionResolver to inject a fixed user without
// going through Supabase Auth.
// ---------------------------------------------------------------------------

type SessionResolver = () => Promise<AppUser | null>;
type ClaimsResolver = (user: AppUser) => Promise<SessionClaims>;

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

let _claimsResolver: ClaimsResolver = async (user) => {
  const member = await prisma.member.findFirst({
    where: { userId: user.id },
    select: {
      id: true,
      officerAssignments: {
        where: {
          officerType: 'CLERGY',
          isActive: true,
        },
        select: { parishId: true },
      },
    },
  });

  const roles = new Set([user.role.toLowerCase()]);
  const clergyParishIds = [...new Set(member?.officerAssignments.map((o) => o.parishId) ?? [])];
  if (clergyParishIds.length > 0) {
    roles.add('clergy');
  }

  return {
    sub: user.id,
    app_metadata: {
      diocese_id: user.dioceseId,
      parish_id: user.parishId,
      roles: [...roles],
      member_id: member?.id ?? null,
      clergy_parish_ids: clergyParishIds,
    },
  };
};

export function _setClaimsResolver(fn: ClaimsResolver): () => void {
  const previous = _claimsResolver;
  _claimsResolver = fn;
  return () => {
    _claimsResolver = previous;
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

// ---------------------------------------------------------------------------
// Claims — derived from the authenticated AppUser (single source of truth).
// Route handlers pass these to withTenant() so RLS policies fire correctly.
// ---------------------------------------------------------------------------

export async function claimsFromUser(user: AppUser): Promise<SessionClaims> {
  return _claimsResolver(user);
}

export async function getSessionClaims(): Promise<SessionClaims | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return claimsFromUser(user);
}

export async function requireSessionClaims(): Promise<SessionClaims> {
  const claims = await getSessionClaims();
  if (!claims) throw new ApiError(401, 'Unauthorized');
  return claims;
}

export async function requireClaimRole(
  requiredRoles: string[],
): Promise<{ user: AppUser; claims: SessionClaims }> {
  const user = await requireSessionUser();
  const claims = await claimsFromUser(user);
  const roleSet = new Set(claims.app_metadata.roles.map((role) => role.toLowerCase()));
  const allowed = requiredRoles.some((role) => roleSet.has(role.toLowerCase()));
  if (!allowed) throw new ApiError(403, 'Forbidden');
  return { user, claims };
}
