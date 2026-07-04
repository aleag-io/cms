import { prisma } from '@/lib/prisma';
import { handle } from '@/lib/api';

/**
 * Public parish list for self-registration.
 *
 * Returns only active parishes with the minimal fields a guest needs to pick
 * a parish. No tenant isolation is required because this is intentionally
 * public and read-only.
 */
export const GET = () =>
  handle(async () => {
    const parishes = await prisma.parish.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return Response.json({ ok: true, parishes });
  });
