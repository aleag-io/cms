import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import {
  requireCents,
  requireDate,
  requireNonEmptyString,
  requireUuid,
} from '@/lib/finance/validate';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

function serialize<T extends { amountCents: bigint }>(bill: T) {
  return { ...bill, amountCents: centsToJson(bill.amountCents) };
}

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }
    const bills = await withTenant(claims, (tx) =>
      tx.vendorBill.findMany({
        where: { ownerType: ledger.ownerType, ownerId: ledger.ownerId },
        include: { vendor: true, payments: true },
        orderBy: { billDate: 'desc' },
        take: 300,
      }),
    );
    return Response.json({
      ok: true,
      ledger,
      bills: bills.map((b) => ({
        ...serialize(b),
        payments: b.payments.map((p) => serialize(p)),
      })),
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

    const vendorId = requireUuid('vendorId', body.vendorId);
    const amountCents = requireCents('amountCents', body.amountCents);
    const description = requireNonEmptyString('description', body.description);
    const billDate = requireDate('billDate', body.billDate);
    const dueDate =
      typeof body.dueDate === 'string' && body.dueDate.trim()
        ? requireDate('dueDate', body.dueDate)
        : null;

    const bill = await withTenant(claims, (tx) =>
      tx.vendorBill.create({
        data: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          vendorId,
          amountCents,
          description,
          invoiceNumber:
            typeof body.invoiceNumber === 'string'
              ? body.invoiceNumber.trim() || null
              : null,
          billDate,
          dueDate,
          status: 'DRAFT',
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.vendorbill.create',
      entityType: 'finance_vendor_bill',
      entityId: bill.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { amountCents: centsToJson(amountCents), vendorId },
    });

    return Response.json({ ok: true, bill: serialize(bill) }, { status: 201 });
  });
