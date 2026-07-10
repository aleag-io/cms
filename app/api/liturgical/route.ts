import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { claimsFromUser, requireRole, requireSessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseLiturgicalCreate } from '@/lib/liturgical/validate';

export const GET = (request: Request) =>
  handle(async () => {
    const claims = await requireSessionClaims();
    const dioceseId = claims.app_metadata.diocese_id;
    if (!dioceseId) throw new ApiError(400, 'Diocese scope required');

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope'); // diocese | parish | all
    const includeUnpublished =
      url.searchParams.get('includeUnpublished') === '1';
    const parishId = claims.app_metadata.parish_id;

    if (scope === 'parish' && !parishId) {
      return Response.json({ ok: true, observances: [] });
    }

    const observances = await withTenant(claims, (tx) =>
      tx.liturgicalObservance.findMany({
        where: {
          dioceseId,
          ...(scope === 'diocese'
            ? { parishId: null }
            : scope === 'parish'
              ? { parishId }
              : {
                  OR: [
                    { parishId: null },
                    ...(parishId ? [{ parishId }] : []),
                  ],
                }),
          ...(!includeUnpublished ? { isPublished: true } : {}),
        },
        orderBy: [{ month: 'asc' }, { day: 'asc' }, { occursOn: 'asc' }],
      }),
    );

    return Response.json({ ok: true, observances });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseLiturgicalCreate(body);
    const parishLocal = body.parishLocal === true;

    const actor = await requireRole(
      parishLocal
        ? [Role.PARISH_ADMIN, Role.PARISH_STAFF]
        : [Role.DIOCESE_ADMIN, Role.DIOCESE_STAFF, Role.GLOBAL_ADMIN],
    );
    if (parishLocal && !actor.parishId) {
      throw new ApiError(400, 'Parish scope required');
    }
    const claims = await claimsFromUser(actor);
    const parishId = parishLocal ? actor.parishId : null;

    const row = await withTenant(claims, (tx) =>
      tx.liturgicalObservance.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          ...input,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'liturgical.observance.create',
      entityType: 'liturgical_observance',
      entityId: row.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
    });

    return Response.json({ ok: true, observance: row });
  });
