import { Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handle } from '@/lib/api';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const GET = (request: Request) =>
  handle(async () => {
    const user = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.PARISH_ADMIN,
    ]);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const limit = Math.min(
      parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT),
      MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    // Mirror the RLS policies exactly (the privileged client bypasses them):
    // parish admins read only their own parish's entries; diocese-level admins
    // (no parish scope) read only diocese-level (parishId IS NULL) entries.
    // Diocese-level entries are NOT exposed to parish admins (audit_diocese_read).
    const auditEntries = await prisma.auditEntry.findMany({
      where: {
        dioceseId: user.dioceseId,
        parishId: user.parishId ?? null,
      },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    });

    return Response.json({
      ok: true,
      auditEntries,
      pagination: {
        page,
        limit,
        nextPage: auditEntries.length === limit ? page + 1 : null,
      },
    });
  });
