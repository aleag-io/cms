import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { parseBankCsv } from '@/lib/finance/reconcile';

const ROLES = [
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
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    if (typeof body.csv !== 'string' || !body.csv.trim()) {
      throw new ApiError(400, 'csv content is required');
    }
    const parsed = parseBankCsv(body.csv);
    if (parsed.rows.length === 0) {
      throw new ApiError(400, 'No valid rows parsed from CSV');
    }

    const run = await withTenant(claims, async (tx) => {
      const created = await tx.reconciliationRun.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          unmatchedCount: parsed.rows.length,
        },
      });
      await tx.bankStatementLine.createMany({
        data: parsed.rows.map((r) => ({
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          reconciliationRunId: created.id,
          postedDate: r.postedDate,
          amountCents: r.amountCents,
          descriptionRaw: r.descriptionRaw,
        })),
      });
      return created;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.reconciliation.import',
      entityType: 'finance_reconciliation_run',
      entityId: run.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { imported: parsed.rows.length, rejected: parsed.rejected.length },
    });

    return Response.json(
      { ok: true, run, imported: parsed.rows.length, rejected: parsed.rejected },
      { status: 201 },
    );
  });
