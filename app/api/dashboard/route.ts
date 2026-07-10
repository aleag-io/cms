import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { loadDashboard } from '@/lib/dashboard/load-dashboard';

/**
 * GET /api/dashboard — role-projected operational dashboard payload.
 * Same data as the home page Server Component (shared loadDashboard).
 */
export const GET = () =>
  handle(async () => {
    const requestId = randomUUID();
    const user = await requireSessionUser();
    const claims = await claimsFromUser(user);
    const dashboard = await loadDashboard(user, claims);

    await writeAuditEntry({
      requestId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'dashboard.read',
      entityType: 'dashboard',
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: claims.app_metadata.parish_id,
      metadata: {
        mode: dashboard.mode,
        pendingWorkItemCount: dashboard.stats.pendingWorkItemCount,
      },
    });

    return Response.json({ ok: true, dashboard });
  });
