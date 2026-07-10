import { randomUUID } from 'node:crypto';
import { AuditOutcome, ObservanceType, Role } from '@prisma/client';
import { claimsFromUser, requireRole, requireSessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

const OBSERVANCE_TYPES = new Set<string>(Object.values(ObservanceType));

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

    const observances = await withTenant(claims, (tx) =>
      tx.liturgicalObservance.findMany({
        where: {
          dioceseId,
          ...(scope === 'diocese'
            ? { parishId: null }
            : scope === 'parish'
              ? { parishId: parishId ?? undefined }
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
    const body = (await request.json()) as {
      title?: string;
      observanceType?: string;
      month?: number | null;
      day?: number | null;
      occursOn?: string | null;
      endsOn?: string | null;
      lectionaryRef?: string | null;
      isPublished?: boolean;
      parishLocal?: boolean;
    };

    if (!body.title?.trim()) throw new ApiError(400, 'title is required');
    const observanceType =
      body.observanceType && OBSERVANCE_TYPES.has(body.observanceType)
        ? (body.observanceType as ObservanceType)
        : ObservanceType.FEAST;

    if (body.parishLocal) {
      const actor = await requireRole([Role.PARISH_ADMIN, Role.PARISH_STAFF]);
      if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
      const claims = await claimsFromUser(actor);

      const row = await withTenant(claims, (tx) =>
        tx.liturgicalObservance.create({
          data: {
            dioceseId: actor.dioceseId,
            parishId: actor.parishId,
            title: body.title!.trim(),
            observanceType,
            month: body.month ?? null,
            day: body.day ?? null,
            occursOn: body.occursOn ? new Date(body.occursOn) : null,
            endsOn: body.endsOn ? new Date(body.endsOn) : null,
            lectionaryRef: body.lectionaryRef ?? null,
            isPublished: body.isPublished ?? true,
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
        parishId: actor.parishId,
      });

      return Response.json({ ok: true, observance: row });
    }

    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.GLOBAL_ADMIN,
    ]);
    const claims = await claimsFromUser(actor);

    const row = await withTenant(claims, (tx) =>
      tx.liturgicalObservance.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId: null,
          title: body.title!.trim(),
          observanceType,
          month: body.month ?? null,
          day: body.day ?? null,
          occursOn: body.occursOn ? new Date(body.occursOn) : null,
          endsOn: body.endsOn ? new Date(body.endsOn) : null,
          lectionaryRef: body.lectionaryRef ?? null,
          isPublished: body.isPublished ?? true,
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
    });

    return Response.json({ ok: true, observance: row });
  });
