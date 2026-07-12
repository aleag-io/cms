import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { requireUuid } from '@/lib/finance/validate';
import { proposeMatches } from '@/lib/finance/reconcile';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

/**
 * Auto-match a run's UNMATCHED bank lines against posted cash-account journal
 * lines by amount + date window. Confirmed matches persist
 * reconciledJournalLineId; the run's matched/unmatched counts are updated.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const runId = requireUuid('runId', body.runId);

    const summary = await withTenant(claims, async (tx) => {
      const run = await tx.reconciliationRun.findUnique({ where: { id: runId } });
      if (!run) throw new ApiError(404, 'Reconciliation run not found');

      const bankLines = await tx.bankStatementLine.findMany({
        where: { reconciliationRunId: runId, status: 'UNMATCHED' },
      });

      // Candidate cash-account journal lines: posted, on this ledger, ASSET
      // accounts, not already reconciled by another statement line.
      const candidateLines = await tx.journalLine.findMany({
        where: {
          account: {
            ownerType: run.ownerType,
            ownerId: run.ownerId,
            type: 'ASSET',
          },
          journalEntry: { status: 'POSTED' },
          bankStatementLines: { none: {} },
        },
        include: { journalEntry: { select: { entryDate: true } } },
      });

      const matches = proposeMatches(
        bankLines.map((b) => ({ id: b.id, amountCents: b.amountCents, postedDate: b.postedDate })),
        candidateLines.map((c) => ({
          journalLineId: c.id,
          amountCents: c.amountCents,
          entryDate: c.journalEntry.entryDate,
        })),
      );

      for (const [bankLineId, journalLineId] of matches) {
        await tx.bankStatementLine.update({
          where: { id: bankLineId },
          data: { reconciledJournalLineId: journalLineId, status: 'MATCHED' },
        });
      }

      const matchedCount = matches.size;
      const unmatchedCount = await tx.bankStatementLine.count({
        where: { reconciliationRunId: runId, status: 'UNMATCHED' },
      });
      await tx.reconciliationRun.update({
        where: { id: runId },
        data: {
          matchedCount: { increment: matchedCount },
          unmatchedCount,
          status: unmatchedCount === 0 ? 'COMPLETED' : 'OPEN',
          completedAt: unmatchedCount === 0 ? new Date() : null,
        },
      });
      return { matchedCount, unmatchedCount };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.reconciliation.match',
      entityType: 'finance_reconciliation_run',
      entityId: runId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id!,
      parishId: claims.app_metadata.parish_id,
      metadata: summary,
    });

    return Response.json({ ok: true, ...summary });
  });
