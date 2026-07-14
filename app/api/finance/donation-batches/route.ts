import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { requireDate, requireNonEmptyString } from '@/lib/finance/validate';
import { centsToJson } from '@/lib/finance/money';

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
    const batches = await withTenant(claims, (tx) =>
      tx.donationBatch.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        orderBy: { batchDate: 'desc' },
        take: 200,
      }),
    );
    return Response.json({
      ok: true,
      ledger,
      batches: batches.map((b) => ({ ...b, totalCents: centsToJson(b.totalCents) })),
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
    const batchDate = requireDate('batchDate', body.batchDate);
    const label = requireNonEmptyString('label', body.label);

    const batch = await withTenant(claims, (tx) =>
      tx.donationBatch.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          batchDate,
          label,
          depositReference:
            typeof body.depositReference === 'string'
              ? body.depositReference.trim() || null
              : null,
          status: 'OPEN',
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.donationbatch.create',
      entityType: 'finance_donation_batch',
      entityId: batch.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { label },
    });

    return Response.json(
      { ok: true, batch: { ...batch, totalCents: centsToJson(batch.totalCents) } },
      { status: 201 },
    );
  });
