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
import { getCommProvider } from '@/lib/communications/providers';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

/**
 * Send generated statements as individual emails with the PDF attached.
 * Idempotent: only GENERATED statements are sent unless resend=true, so a
 * repeat call writes no duplicate finance.statement.send rows (exit gate #7).
 */
export const POST = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    const taxYear = Number(body.taxYear);
    if (!Number.isInteger(taxYear)) throw new ApiError(400, 'taxYear required');
    const resend = body.resend === true;
    const dioceseId = claims.app_metadata.diocese_id!;
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Statements are parish-scoped');

    const parish = await withTenant(claims, (tx) =>
      tx.parish.findUniqueOrThrow({ where: { id: parishId }, select: { name: true } }),
    );

    const statements = await withTenant(claims, (tx) =>
      tx.givingStatement.findMany({
        where: {
          parishId,
          periodKey: String(taxYear),
          status: resend ? { in: ['GENERATED', 'SENT'] } : 'GENERATED',
        },
        include: {
          family: { select: { primaryContactEmail: true } },
          member: { select: { email: true, family: { select: { primaryContactEmail: true } } } },
        },
      }),
    );

    let sent = 0;
    let skipped = 0;
    for (const s of statements) {
      const destination =
        s.recipientType === 'FAMILY'
          ? s.family?.primaryContactEmail
          : (s.member?.email ?? s.member?.family?.primaryContactEmail);
      if (!destination) {
        skipped++;
        continue;
      }

      // Re-render the PDF from the immutable snapshot data for the attachment.
      const statement = await withTenant(claims, (tx) =>
        s.recipientType === 'FAMILY'
          ? computeFamilyStatement(tx, s.familyId!, taxYear)
          : computeMemberStatement(tx, s.memberId!, taxYear),
      );
      const pdf = await renderStatementPdf({ parishName: parish.name, statement });

      await getCommProvider().send('EMAIL', destination, {
        subject: `Your ${taxYear} Contribution Statement — ${parish.name}`,
        body: `Attached is your ${taxYear} annual contribution statement. Thank you for your generosity.`,
        idempotencyKey: `giving-statement:${s.id}:${taxYear}`,
        attachment: {
          filename: `contribution-statement-${taxYear}.pdf`,
          content: pdf,
          mimeType: 'application/pdf',
        },
      });

      await withTenant(claims, (tx) =>
        tx.givingStatement.update({
          where: { id: s.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
      );
      // One audit row per recipient+period (exit gate #7 idempotency assertion).
      await writeAuditEntry({
        requestId: randomUUID(),
        actorUserId: actor.id,
        actorLabel: actor.email,
        action: 'finance.statement.send',
        entityType: 'finance_giving_statement',
        entityId: s.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId,
        parishId,
        metadata: { taxYear, recipientType: s.recipientType },
      });
      sent++;
    }

    return Response.json({ ok: true, sent, skipped });
  });
