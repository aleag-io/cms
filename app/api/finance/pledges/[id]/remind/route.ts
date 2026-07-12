import { Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/api';
import { processPledgeReminders } from '@/lib/finance/pledgeReminders';

const ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.DIOCESE_STAFF,
  Role.PARISH_ADMIN,
  Role.PARISH_STAFF,
] as const;

/** Manually enqueue a reminder for a single pledge ("Send reminder now"). */
export const POST = (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireRole([...ROLES]);
    const result = await processPledgeReminders({
      onlyPledgeId: id,
      lookaheadDays: 3650,
    });
    return Response.json({ ok: true, ...result });
  });
