import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { parseJournalCreate } from '@/lib/finance/validate';
import { postJournalEntry } from '@/lib/finance/posting';
import { openApprovalRequest } from '@/lib/finance/approval-flow';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { centsToJson } from '@/lib/finance/money';

const FINANCE_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

function serializeEntry<T extends { lines?: Array<{ amountCents: bigint }> }>(
  entry: T,
) {
  return {
    ...entry,
    lines: entry.lines?.map((l) => ({
      ...l,
      amountCents: centsToJson(l.amountCents),
    })),
  };
}

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    const status = url.searchParams.get('status');
    const entries = await withTenant(claims, (tx) =>
      tx.journalEntry.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          ...(status
            ? { status: status as 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED' | 'VOID' }
            : {}),
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        include: { lines: true },
        take: 200,
      }),
    );

    return Response.json({
      ok: true,
      ledger,
      entries: entries.map(serializeEntry),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const input = parseJournalCreate(body);

    const amountCents = input.lines
      .filter((l) => l.direction === 'DEBIT')
      .reduce((a, l) => a + l.amountCents, BigInt(0));

    const result = await withTenant(claims, async (tx) => {
      // Always create as DRAFT with lines (immutability trigger), then route
      // through maker-checker if the maker is submitting.
      const draft = await postJournalEntry(tx, {
        ledger,
        periodId: input.periodId,
        entryDate: input.entryDate,
        description: input.description,
        reference: input.reference,
        cashImpact: input.cashImpact,
        status: 'DRAFT',
        createdByUserId: actor.id,
        lines: input.lines,
      });

      if (!input.submit) {
        return { entry: draft, approval: null as null | { autoApproved: boolean } };
      }

      const { request, autoApproved } = await openApprovalRequest(tx, {
        ledger,
        entityKind: 'JOURNAL',
        entityId: draft.id,
        makerUserId: actor.id,
        amountCents,
      });

      const entry = await tx.journalEntry.update({
        where: { id: draft.id },
        data: autoApproved
          ? { status: 'POSTED', postedAt: new Date(), postedByUserId: actor.id }
          : { status: 'PENDING_APPROVAL' },
        include: { lines: true },
      });
      return { entry, approval: { autoApproved }, requestId: request.id };
    });

    const action = !input.submit
      ? 'finance.journal.create'
      : result.approval?.autoApproved
        ? 'finance.journal.post'
        : 'finance.approval.request';

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action,
      entityType: 'finance_journal_entry',
      entityId: result.entry.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: {
        journalEntryId: result.entry.id,
        status: result.entry.status,
        ownerType: ledger.ownerType,
      },
    });

    return Response.json(
      { ok: true, entry: serializeEntry(result.entry) },
      { status: 201 },
    );
  });
