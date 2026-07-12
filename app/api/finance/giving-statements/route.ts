import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { centsToJson } from '@/lib/finance/money';

const STAFF_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.MEMBER,
] as const;

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...STAFF_ROLES]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    const mine = url.searchParams.get('mine') === '1';
    const taxYear = url.searchParams.get('taxYear');

    // `mine` returns only the caller's own MEMBER statements (RLS-enforced);
    // otherwise parish staff see all parish statements.
    const statements = await withTenant(claims, (tx) =>
      tx.givingStatement.findMany({
        where: {
          ...(mine
            ? { recipientType: 'MEMBER', memberId: claims.app_metadata.member_id ?? '' }
            : { parishId: claims.app_metadata.parish_id ?? undefined }),
          ...(taxYear ? { periodKey: taxYear } : {}),
        },
        include: {
          family: { select: { familyName: true } },
          member: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );

    return Response.json({
      ok: true,
      statements: statements.map((s) => ({
        ...s,
        totalCents: centsToJson(s.totalCents),
        pdfBlobUrl: undefined, // never expose the storage URL; download via /pdf
      })),
    });
  });
