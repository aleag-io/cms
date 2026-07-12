import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import {
  computeFamilyStatement,
  computeMemberStatement,
} from '@/lib/finance/statements';
import { renderStatementPdf } from '@/lib/finance/statement-pdf';
import { isStoredBlobUrl } from '@/lib/finance/blob';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.MEMBER,
] as const;

/**
 * Stream the statement PDF. The route (not the Blob URL) is the gate: the row
 * is fetched through RLS, so a member can only reach their own MEMBER row.
 * Re-renders on demand when Blob storage isn't configured.
 */
export const GET = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);

    const statement = await withTenant(claims, (tx) =>
      tx.givingStatement.findUnique({ where: { id } }),
    );
    if (!statement) throw new ApiError(404, 'Statement not found');

    let pdf: Buffer;
    if (isStoredBlobUrl(statement.pdfBlobUrl)) {
      const res = await fetch(statement.pdfBlobUrl);
      if (!res.ok) throw new ApiError(502, 'Could not fetch stored statement');
      pdf = Buffer.from(await res.arrayBuffer());
    } else {
      const parish = await withTenant(claims, (tx) =>
        tx.parish.findUniqueOrThrow({
          where: { id: statement.parishId! },
          select: { name: true },
        }),
      );
      const computed = await withTenant(claims, (tx) =>
        statement.recipientType === 'FAMILY'
          ? computeFamilyStatement(tx, statement.familyId!, Number(statement.periodKey))
          : computeMemberStatement(tx, statement.memberId!, Number(statement.periodKey)),
      );
      pdf = await renderStatementPdf({ parishName: parish.name, statement: computed });
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="statement-${statement.periodKey}.pdf"`,
      },
    });
  });
