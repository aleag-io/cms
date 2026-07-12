import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import {
  optionalUuid,
  parseDonationMethod,
  requireCents,
  requireDate,
  requireUuid,
} from '@/lib/finance/validate';
import { postJournalEntry, findCoveringPeriod } from '@/lib/finance/posting';
import { centsToJson } from '@/lib/finance/money';

const GIVING_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...GIVING_ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const parishId =
      url.searchParams.get('parishId') ?? claims.app_metadata.parish_id;

    const donations = await withTenant(claims, (tx) =>
      tx.donation.findMany({
        where: {
          dioceseId: claims.app_metadata.diocese_id!,
          ...(parishId ? { parishId } : { parishId: null }),
          status: 'ACTIVE',
        },
        orderBy: { receivedAt: 'desc' },
        include: { allocations: true },
        take: 200,
      }),
    );

    return Response.json({
      ok: true,
      donations: donations.map((d) => ({
        ...d,
        amountCents: centsToJson(d.amountCents),
        allocations: d.allocations.map((a) => ({
          ...a,
          amountCents: centsToJson(a.amountCents),
        })),
      })),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...GIVING_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;

    const dioceseId = claims.app_metadata.diocese_id!;
    // Diocese gifts: parishId null; parish gifts: session parish or body
    const isDioceseGift = body.scope === 'diocese';
    const parishId = isDioceseGift
      ? null
      : (optionalUuid('parishId', body.parishId) ??
        claims.app_metadata.parish_id);
    if (!isDioceseGift && !parishId) {
      throw new ApiError(400, 'parishId required for parish donations');
    }

    const amountCents = requireCents('amountCents', body.amountCents);
    const method = parseDonationMethod(body.method);
    const receivedAt = requireDate('receivedAt', body.receivedAt);
    const isAnonymous = body.isAnonymous === true;
    const familyId = optionalUuid('familyId', body.familyId);
    const memberId = optionalUuid('memberId', body.memberId);
    const externalDonorId = optionalUuid('externalDonorId', body.externalDonorId);
    const fundId = optionalUuid('fundId', body.fundId);
    const campaignId = optionalUuid('campaignId', body.campaignId);
    const cashAccountId = requireUuid('cashAccountId', body.cashAccountId);
    const incomeAccountId = requireUuid(
      'incomeAccountId',
      body.incomeAccountId,
    );
    const checkNumber =
      typeof body.checkNumber === 'string' ? body.checkNumber.trim() : null;
    const externalTxnId =
      typeof body.externalTxnId === 'string'
        ? body.externalTxnId.trim() || null
        : null;
    const dedication =
      typeof body.dedication === 'string' ? body.dedication.trim() || null : null;

    if (isAnonymous && (familyId || memberId || externalDonorId)) {
      throw new ApiError(400, 'Anonymous gifts cannot have a donor principal');
    }
    if (method === 'CHECK' && !checkNumber) {
      // soft: allow missing on import paths; warn via metadata only for now
    }

    // Ledger owner for auto-journal: diocese or parish general books
    const ledger = isDioceseGift
      ? {
          ownerType: 'DIOCESE' as const,
          ownerId: dioceseId,
          dioceseId,
          parishId: null as string | null,
        }
      : {
          ownerType: 'PARISH' as const,
          ownerId: parishId!,
          dioceseId,
          parishId: parishId!,
        };

    const created = await withTenant(claims, async (tx) => {
      const period =
        (body.periodId
          ? await tx.accountingPeriod.findUnique({
              where: { id: String(body.periodId) },
            })
          : null) ?? (await findCoveringPeriod(tx, ledger, receivedAt));
      if (!period || period.status === 'CLOSED') {
        throw new ApiError(400, 'No open accounting period covers this date');
      }

      const journal = await postJournalEntry(tx, {
        ledger,
        periodId: period.id,
        entryDate: receivedAt,
        description: `Donation ${method}${checkNumber ? ` #${checkNumber}` : ''}`,
        source: 'DONATION',
        cashImpact: true,
        status: 'POSTED',
        createdByUserId: actor.id,
        lines: [
          {
            accountId: cashAccountId,
            direction: 'DEBIT',
            amountCents,
          },
          {
            accountId: incomeAccountId,
            direction: 'CREDIT',
            amountCents,
          },
        ],
      });

      const donation = await tx.donation.create({
        data: {
          dioceseId,
          parishId,
          familyId,
          memberId,
          externalDonorId,
          isAnonymous,
          fundId,
          campaignId,
          periodId: period.id,
          amountCents,
          method,
          checkNumber,
          externalTxnId,
          dedication,
          receivedAt,
          status: 'ACTIVE',
          journalEntryId: journal.id,
          ...(fundId
            ? {
                allocations: {
                  create: [{ fundId, amountCents }],
                },
              }
            : {}),
        },
        include: { allocations: true },
      });

      return { donation, journal };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.donation.create',
      entityType: 'finance_donation',
      entityId: created.donation.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId,
      parishId,
      metadata: {
        method,
        amountCents: centsToJson(amountCents),
        journalEntryId: created.journal.id,
        isAnonymous,
        scope: isDioceseGift ? 'diocese' : 'parish',
      },
    });

    return Response.json(
      {
        ok: true,
        donation: {
          ...created.donation,
          amountCents: centsToJson(created.donation.amountCents),
          allocations: created.donation.allocations.map((a) => ({
            ...a,
            amountCents: centsToJson(a.amountCents),
          })),
        },
      },
      { status: 201 },
    );
  });
