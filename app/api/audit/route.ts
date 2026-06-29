import { requireSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handle } from '@/lib/api';

export const GET = () =>
  handle(async () => {
    const user = await requireSessionUser();

    const auditEntries = await prisma.auditEntry.findMany({
      where: {
        dioceseId: user.dioceseId,
        OR: user.parishId
          ? [{ parishId: user.parishId }, { parishId: null }]
          : [{ parishId: null }],
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return Response.json({ ok: true, auditEntries });
  });
