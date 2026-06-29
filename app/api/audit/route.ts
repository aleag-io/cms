import { requireSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
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
}
