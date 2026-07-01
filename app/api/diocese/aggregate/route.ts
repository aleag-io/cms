import { randomUUID } from 'node:crypto';
import { Prisma, Role, AuditOutcome } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

type MemberSummaryRow = {
  parish_id: string;
  active_count: number;
  inactive_count: number;
  deceased_count: number;
  moved_count: number;
  total_count: number;
};

type FamilySummaryRow = {
  parish_id: string;
  family_count: number;
  active_family_count: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.DIOCESE_REPORT_VIEWER,
    ]);
    const claims = await claimsFromUser(actor);

    const parishId = new URL(request.url).searchParams.get('parishId');
    if (parishId && !UUID_RE.test(parishId)) {
      throw new ApiError(400, 'Invalid parishId');
    }

    const { memberRows, familyRows } = await withTenant(claims, async (tx) => {
      const memberRows = await tx.$queryRaw<MemberSummaryRow[]>`
        SELECT parish_id, active_count, inactive_count, deceased_count, moved_count, total_count
        FROM diocese_parish_member_summary
        ${parishId
          ? Prisma.sql`WHERE parish_id = ${parishId}::uuid`
          : Prisma.empty}
        ORDER BY parish_id
      `;

      const familyRows = await tx.$queryRaw<FamilySummaryRow[]>`
        SELECT parish_id, family_count, active_family_count
        FROM diocese_parish_family_summary
        ${parishId
          ? Prisma.sql`WHERE parish_id = ${parishId}::uuid`
          : Prisma.empty}
        ORDER BY parish_id
      `;

      return { memberRows, familyRows };
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'diocese.aggregate.read',
      entityType: 'diocese_aggregate',
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: parishId ?? null,
      metadata: { parishCount: memberRows.length },
    });

    return Response.json({
      ok: true,
      memberSummary: memberRows,
      familySummary: familyRows,
    });
  });
