import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { requireCents, requireUuid } from '@/lib/finance/validate';
import { centsToJson } from '@/lib/finance/money';
import { computeAccountActuals } from '@/lib/finance/reporting';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const fiscalYear = Number(url.searchParams.get('fiscalYear')) || new Date().getFullYear();

    const data = await withTenant(claims, async (tx) => {
      const budget = await tx.budget.findFirst({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          fiscalYear,
        },
        include: { lines: { include: { account: true } } },
      });
      const actuals = await computeAccountActuals(
        tx,
        { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        {
          from: new Date(Date.UTC(fiscalYear, 0, 1)),
          to: new Date(Date.UTC(fiscalYear, 11, 31)),
        },
      );
      return { budget, actuals };
    });

    return Response.json({
      ok: true,
      ledger,
      fiscalYear,
      budget: data.budget
        ? {
            ...data.budget,
            lines: data.budget.lines.map((l) => {
              const actual = data.actuals.get(l.accountId) ?? BigInt(0);
              return {
                ...l,
                originalCents: centsToJson(l.originalCents),
                revisedCents: centsToJson(l.revisedCents),
                actualCents: centsToJson(actual),
                varianceCents: centsToJson(l.revisedCents - actual),
              };
            }),
          }
        : null,
    });
  });

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
    const fiscalYear = Number(body.fiscalYear);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
      throw new ApiError(400, 'fiscalYear must be a valid year');
    }
    const linesRaw = Array.isArray(body.lines) ? body.lines : [];

    const budget = await withTenant(claims, async (tx) => {
      const b = await tx.budget.upsert({
        where: {
          ownerType_ownerId_fiscalYear: {
            ownerType: ledger.ownerType,
            ownerId: ledger.ownerId,
            fiscalYear,
          },
        },
        create: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          fiscalYear,
        },
        update: {},
      });
      for (const raw of linesRaw) {
        const row = raw as Record<string, unknown>;
        const accountId = requireUuid('accountId', row.accountId);
        const originalCents = requireCents('originalCents', row.originalCents);
        const revisedCents =
          row.revisedCents == null ? originalCents : requireCents('revisedCents', row.revisedCents);
        await tx.budgetLine.upsert({
          where: { budgetId_accountId: { budgetId: b.id, accountId } },
          create: { budgetId: b.id, accountId, originalCents, revisedCents },
          update: { revisedCents },
        });
      }
      return b;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.budget.upsert',
      entityType: 'finance_budget',
      entityId: budget.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { fiscalYear },
    });

    return Response.json({ ok: true, budget }, { status: 201 });
  });
