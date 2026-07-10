import { requireSessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { ApiError, handle } from '@/lib/api';
import {
  canAccessSacramental,
  mapOverrides,
} from '@/lib/sacramental/access';
import { isSacramentType } from '@/lib/sacramental/constants';
import type { Prisma } from '@prisma/client';

export const GET = (request: Request) =>
  handle(async () => {
    const claims = await requireSessionClaims();
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Parish scope required');

    const overrides = await withTenant(claims, (tx) =>
      tx.parishPermissionOverride.findMany({ where: { parishId } }),
    );
    if (!canAccessSacramental(claims, 'read', mapOverrides(overrides))) {
      throw new ApiError(403, 'Forbidden');
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const type = url.searchParams.get('type');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const includeInactive = url.searchParams.get('includeInactive') === '1';

    const where: Prisma.SacramentalRecordWhereInput = {
      parishId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    if (type) {
      if (!isSacramentType(type)) {
        throw new ApiError(400, 'Invalid sacrament type');
      }
      where.sacramentType = type;
    }
    const parseDate = (value: string | null, name: string): Date | null => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new ApiError(400, `${name} must be a valid date`);
      }
      return d;
    };
    const fromDate = parseDate(from, 'from');
    const toDate = parseDate(to, 'to');
    if (fromDate || toDate) {
      where.occurredOn = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }
    if (q) {
      where.OR = [
        { member: { firstName: { contains: q, mode: 'insensitive' } } },
        { member: { lastName: { contains: q, mode: 'insensitive' } } },
        { member: { memberIdentifier: { contains: q, mode: 'insensitive' } } },
        { officiantName: { contains: q, mode: 'insensitive' } },
        { registerBook: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await withTenant(claims, (tx) =>
      tx.sacramentalRecord.findMany({
        where,
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              memberIdentifier: true,
            },
          },
        },
        orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    );

    return Response.json({ ok: true, records });
  });
