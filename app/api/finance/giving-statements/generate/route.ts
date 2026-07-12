import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import {
  computeFamilyStatement,
  computeMemberStatement,
} from '@/lib/finance/statements';
import { renderStatementPdf } from '@/lib/finance/statement-pdf';
import { storeStatementPdf } from '@/lib/finance/blob';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

type RecipientType = 'FAMILY' | 'MEMBER';

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const taxYear = Number(body.taxYear);
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 3000) {
      throw new ApiError(400, 'taxYear must be a valid year');
    }
    const recipientTypeRaw = String(body.recipientType ?? 'ALL').toUpperCase();
    if (!['FAMILY', 'MEMBER', 'ALL'].includes(recipientTypeRaw)) {
      throw new ApiError(400, 'recipientType must be FAMILY|MEMBER|ALL');
    }
    const dioceseId = claims.app_metadata.diocese_id!;
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Statements are parish-scoped');

    const generated = await withTenant(claims, async (tx) => {
      const parish = await tx.parish.findUniqueOrThrow({
        where: { id: parishId },
        select: { name: true },
      });
      const wantFamily = recipientTypeRaw === 'FAMILY' || recipientTypeRaw === 'ALL';
      const wantMember = recipientTypeRaw === 'MEMBER' || recipientTypeRaw === 'ALL';
      const yearFilter = {
        gte: new Date(Date.UTC(taxYear, 0, 1)),
        lte: new Date(Date.UTC(taxYear, 11, 31, 23, 59, 59)),
      };

      const targets: { recipientType: RecipientType; familyId?: string; memberId?: string }[] = [];
      if (wantFamily) {
        const fams = await tx.donation.findMany({
          where: { parishId, status: 'ACTIVE', familyId: { not: null }, receivedAt: yearFilter },
          distinct: ['familyId'],
          select: { familyId: true },
        });
        for (const f of fams) if (f.familyId) targets.push({ recipientType: 'FAMILY', familyId: f.familyId });
      }
      if (wantMember) {
        const mems = await tx.donation.findMany({
          where: { parishId, status: 'ACTIVE', memberId: { not: null }, receivedAt: yearFilter },
          distinct: ['memberId'],
          select: { memberId: true },
        });
        for (const m of mems) if (m.memberId) targets.push({ recipientType: 'MEMBER', memberId: m.memberId });
      }

      let count = 0;
      for (const t of targets) {
        const statement =
          t.recipientType === 'FAMILY'
            ? await computeFamilyStatement(tx, t.familyId!, taxYear)
            : await computeMemberStatement(tx, t.memberId!, taxYear);
        if (statement.lineItems.length === 0) continue;

        const pdf = await renderStatementPdf({ parishName: parish.name, statement });
        const blobUrl = await storeStatementPdf(
          `statements/${parishId}/${taxYear}/${t.recipientType}-${t.familyId ?? t.memberId}.pdf`,
          pdf,
        );

        const existing = await tx.givingStatement.findFirst({
          where: {
            dioceseId,
            parishId,
            periodType: 'ANNUAL',
            periodKey: String(taxYear),
            recipientType: t.recipientType,
            familyId: t.familyId ?? null,
            memberId: t.memberId ?? null,
            externalDonorId: null,
          },
        });
        if (existing) {
          await tx.givingStatement.update({
            where: { id: existing.id },
            data: { totalCents: statement.totalCents, pdfBlobUrl: blobUrl, status: 'GENERATED' },
          });
        } else {
          await tx.givingStatement.create({
            data: {
              dioceseId,
              parishId,
              periodType: 'ANNUAL',
              periodKey: String(taxYear),
              recipientType: t.recipientType,
              familyId: t.familyId ?? null,
              memberId: t.memberId ?? null,
              totalCents: statement.totalCents,
              pdfBlobUrl: blobUrl,
              generatedByUserId: actor.id,
            },
          });
        }
        count++;
      }
      return count;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.statement.generate',
      entityType: 'finance_giving_statement',
      entityId: `${parishId}:${taxYear}`,
      outcome: AuditOutcome.SUCCESS,
      dioceseId,
      parishId,
      metadata: { taxYear, generated },
    });

    return Response.json({ ok: true, generated });
  });
