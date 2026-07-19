import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { handle } from '@/lib/api';
import { listReportsForRoles } from '@/lib/reports/registry';
import type { ReportScope } from '@/lib/reports/types';

/// Report catalog for the current actor. Metadata only — no data access, so no
/// audit row; running a report is the audited action.
export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const requested = url.searchParams.get('scope');
    const scope: ReportScope =
      requested === 'diocese'
        ? 'diocese'
        : requested === 'parish'
          ? 'parish'
          : claims.app_metadata.parish_id
            ? 'parish'
            : 'diocese';

    const reports = listReportsForRoles(claims.app_metadata.roles, scope).map(
      (def) => ({
        id: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        scopes: def.scopes,
        needsLedgerOwner: def.needsLedgerOwner ?? false,
        params: def.params,
      }),
    );

    return Response.json({ ok: true, scope, reports });
  });
