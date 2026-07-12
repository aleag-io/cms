import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseJournalCreate } from '@/lib/finance/validate';
import { updateDraftJournalEntry } from '@/lib/finance/posting';
import { openApprovalRequest } from '@/lib/finance/approval-flow';
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

export const GET = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);

    const entry = await withTenant(claims, (tx) =>
      tx.journalEntry.findUnique({
        where: { id },
        include: {
          lines: { include: { account: true } },
          reversesEntry: { select: { id: true, description: true } },
          reversedBy: { select: { id: true, description: true } },
        },
      }),
    );
    if (!entry) throw new ApiError(404, 'Journal entry not found');

    const approvals = await withTenant(claims, (tx) =>
      tx.approvalRequest.findMany({
        where: { entityKind: 'JOURNAL', entityId: id },
        include: { decisions: true },
        orderBy: { createdAt: 'desc' },
      }),
    );

    return Response.json({
      ok: true,
      entry: serializeEntry(entry),
      approvals: approvals.map((a) => ({
        ...a,
        amountCents: centsToJson(a.amountCents),
      })),
    });
  });

export const PATCH = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...FINANCE_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;

    // Submit an existing DRAFT for posting/approval.
    if (body.action === 'submit') {
      const result = await withTenant(claims, async (tx) => {
        const draft = await tx.journalEntry.findUnique({
          where: { id },
          include: { lines: true },
        });
        if (!draft) throw new ApiError(404, 'Journal entry not found');
        if (draft.status !== 'DRAFT') {
          throw new ApiError(400, 'Only DRAFT entries can be submitted');
        }
        const amountCents = draft.lines
          .filter((l) => l.direction === 'DEBIT')
          .reduce((a, l) => a + l.amountCents, BigInt(0));

        const { autoApproved } = await openApprovalRequest(tx, {
          ledger: {
            ownerType: draft.ownerType,
            ownerId: draft.ownerId,
            dioceseId: draft.dioceseId,
            parishId: draft.parishId,
          },
          entityKind: 'JOURNAL',
          entityId: draft.id,
          makerUserId: actor.id,
          amountCents,
        });

        const entry = await tx.journalEntry.update({
          where: { id },
          data: autoApproved
            ? { status: 'POSTED', postedAt: new Date(), postedByUserId: actor.id }
            : { status: 'PENDING_APPROVAL' },
          include: { lines: true },
        });
        return { entry, autoApproved };
      });

      await writeAuditEntry({
        requestId,
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: result.autoApproved
          ? 'finance.journal.post'
          : 'finance.approval.request',
        entityType: 'finance_journal_entry',
        entityId: id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: result.entry.dioceseId,
        parishId: result.entry.parishId,
        metadata: { status: result.entry.status },
      });

      return Response.json({ ok: true, entry: serializeEntry(result.entry) });
    }

    // Edit a DRAFT's header + lines.
    const parsed = parseJournalCreate({ ...body, submit: false });
    const entry = await withTenant(claims, (tx) =>
      updateDraftJournalEntry(tx, id, {
        entryDate: parsed.entryDate,
        description: parsed.description,
        reference: parsed.reference,
        cashImpact: parsed.cashImpact,
        lines: parsed.lines,
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.journal.update',
      entityType: 'finance_journal_entry',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: entry.dioceseId,
      parishId: entry.parishId,
      metadata: { status: entry.status },
    });

    return Response.json({ ok: true, entry: serializeEntry(entry) });
  });
