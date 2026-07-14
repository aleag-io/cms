import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseBatchDonationLine } from '@/lib/finance/validate';
import { findCoveringPeriod } from '@/lib/finance/posting';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

/** Add one or more gifts to an OPEN batch. Gifts do not post individually. */
export const POST = (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const rawLines = Array.isArray(body.lines) ? body.lines : [body];
    const lines = rawLines.map((l) => parseBatchDonationLine(l as Record<string, unknown>));

    const created = await withTenant(claims, async (tx) => {
      const batch = await tx.donationBatch.findUnique({ where: { id } });
      if (!batch) throw new ApiError(404, 'Batch not found');
      if (batch.status !== 'OPEN') throw new ApiError(400, 'Batch is not open');
      const ledger = {
        ownerType: batch.ownerType,
        ownerId: batch.ownerId,
        dioceseId: batch.dioceseId,
        parishId: batch.parishId,
      };

      const ids: string[] = [];
      for (const line of lines) {
        const receivedAt = line.receivedAt ?? batch.batchDate;
        const category = await tx.givingCategory.findUnique({ where: { id: line.categoryId } });
        if (!category || category.ownerType !== batch.ownerType || category.ownerId !== batch.ownerId) {
          throw new ApiError(400, 'category is not on this ledger');
        }
        const period = await findCoveringPeriod(tx, ledger, receivedAt);
        if (!period) throw new ApiError(400, 'No open accounting period covers this date');

        const donation = await tx.donation.create({
          data: {
            dioceseId: batch.dioceseId,
            parishId: batch.parishId,
            familyId: line.familyId,
            memberId: line.memberId,
            externalDonorId: line.externalDonorId,
            isAnonymous: line.isAnonymous,
            fundId: category.fundId,
            categoryId: category.id,
            periodId: period.id,
            batchId: batch.id,
            amountCents: line.amountCents,
            method: line.method,
            checkNumber: line.checkNumber,
            receivedAt,
            status: 'ACTIVE',
          },
        });
        ids.push(donation.id);
      }

      const agg = await tx.donation.aggregate({
        where: { batchId: id, status: 'ACTIVE' },
        _sum: { amountCents: true },
        _count: true,
      });
      const updated = await tx.donationBatch.update({
        where: { id },
        data: { totalCents: agg._sum.amountCents ?? BigInt(0), donationCount: agg._count },
      });
      return { ids, batch: updated };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.donation.create',
      entityType: 'finance_donation_batch',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: created.batch.dioceseId,
      parishId: created.batch.parishId,
      metadata: { added: created.ids.length },
    });

    return Response.json(
      {
        ok: true,
        added: created.ids.length,
        batch: { ...created.batch, totalCents: centsToJson(created.batch.totalCents) },
      },
      { status: 201 },
    );
  });
