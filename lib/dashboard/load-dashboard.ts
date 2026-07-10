import type { AppUser } from '@prisma/client';
import type { SessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { isDioceseScopedRole } from '@/lib/context/working-parish';
import {
  isMemberOnly,
  projectDioceseDashboard,
  projectMemberDashboard,
  projectParishDashboard,
} from '@/lib/dashboard/project';
import {
  loadDioceseDashboardRaw,
  loadParishDashboardRaw,
} from '@/lib/dashboard/queries';
import type { DashboardDto } from '@/lib/dashboard/types';
import { ApiError } from '@/lib/api';

/**
 * Load and role-project the dashboard for the current session.
 * Used by both the page Server Component and GET /api/dashboard.
 */
export async function loadDashboard(
  user: AppUser,
  claims: SessionClaims,
  now: Date = new Date(),
): Promise<DashboardDto> {
  const parishId = claims.app_metadata.parish_id;
  const dioceseId = claims.app_metadata.diocese_id;

  // Pure member (no staff elevation) → reduced safe dashboard
  if (isMemberOnly(claims)) {
    return projectMemberDashboard({
      scope: {
        dioceseId,
        parishId,
        parishName: null,
      },
      memberId: claims.app_metadata.member_id,
    });
  }

  // Parish-scoped (home parish or diocese work-context)
  if (parishId) {
    const raw = await withTenant(claims, (tx) =>
      loadParishDashboardRaw(tx, parishId, dioceseId, now),
    );
    return projectParishDashboard(raw, claims);
  }

  // Diocese-wide (no working parish)
  if (isDioceseScopedRole(user.role)) {
    const raw = await withTenant(claims, (tx) =>
      loadDioceseDashboardRaw(tx, dioceseId, now),
    );
    return projectDioceseDashboard(raw, claims);
  }

  throw new ApiError(403, 'No dashboard scope for this role');
}
