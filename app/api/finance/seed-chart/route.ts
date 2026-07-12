import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { seedDefaultChart } from '@/lib/finance/seedChart';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';

const FINANCE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    const result = await withTenant(claims, (tx) =>
      seedDefaultChart(tx, ledger),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.chart.seed',
      entityType: 'finance_chart',
      entityId: null,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { ...result, ownerType: ledger.ownerType },
    });

    return Response.json({ ok: true, ledger, ...result });
  });
