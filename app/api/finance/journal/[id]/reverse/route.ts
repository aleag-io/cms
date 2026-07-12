import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { reverseJournalEntry } from '@/lib/finance/posting';
import { centsToJson } from '@/lib/finance/money';

const FINANCE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const POST = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    let description: string | undefined;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.description === 'string') description = body.description;
    } catch {
      // empty body ok
    }

    const entry = await withTenant(claims, (tx) =>
      reverseJournalEntry(tx, id, actor.id, description),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.journal.reverse',
      entityType: 'finance_journal_entry',
      entityId: entry.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: entry.dioceseId,
      parishId: entry.parishId,
      metadata: {
        journalEntryId: entry.id,
        reversesEntryId: entry.reversesEntryId,
      },
    });

    return Response.json({
      ok: true,
      entry: {
        ...entry,
        lines: entry.lines.map((l) => ({
          ...l,
          amountCents: centsToJson(l.amountCents),
        })),
      },
    });
  });
