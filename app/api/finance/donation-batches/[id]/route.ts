import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import { centsToJson } from '@/lib/finance/money';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
  Role.ORGANIZATION_LEADER,
] as const;

export const GET = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireRole([...ROLES]);
    const claims = await claimsFromUser(actor);

    const batch = await withTenant(claims, (tx) =>
      tx.donationBatch.findUnique({
        where: { id },
        include: {
          donations: {
            orderBy: { createdAt: 'asc' },
            include: {
              category: { select: { name: true } },
              family: { select: { familyName: true } },
              member: { select: { firstName: true, lastName: true } },
              externalDonor: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!batch) throw new ApiError(404, 'Batch not found');

    return Response.json({
      ok: true,
      batch: {
        ...batch,
        totalCents: centsToJson(batch.totalCents),
        donations: batch.donations.map((d) => ({
          ...d,
          amountCents: centsToJson(d.amountCents),
        })),
      },
    });
  });
