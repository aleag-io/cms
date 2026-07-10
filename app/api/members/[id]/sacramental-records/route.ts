import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { requireSessionClaims } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import {
  canAccessSacramental,
  canReadMemberSacramental,
  mapOverrides,
} from '@/lib/sacramental/access';
import { parseSacramentalBody } from '@/lib/sacramental/validate';
import { syncPastoralDatesFromRegister } from '@/lib/sacramental/sync-pastoral';

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const claims = await requireSessionClaims();
    const { id: memberId } = await context.params;
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === '1';

    const parishId = claims.app_metadata.parish_id;
    if (!parishId && !claims.app_metadata.diocese_id) {
      throw new ApiError(400, 'Tenant scope required');
    }

    const overrides = parishId
      ? await withTenant(claims, (tx) =>
          tx.parishPermissionOverride.findMany({ where: { parishId } }),
        )
      : [];
    const mapped = mapOverrides(overrides);

    if (!canReadMemberSacramental(claims, memberId, mapped)) {
      return Response.json({ ok: true, records: [] });
    }

    const privileged = canAccessSacramental(claims, 'read', mapped);
    const records = await withTenant(claims, (tx) =>
      tx.sacramentalRecord.findMany({
        where: {
          memberId,
          ...(includeInactive && privileged ? {} : { isActive: true }),
        },
        orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      }),
    );

    return Response.json({ ok: true, records });
  });

export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const claims = await requireSessionClaims();
    const { id: memberId } = await context.params;
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) throw new ApiError(400, 'Parish scope required');

    const overrides = await withTenant(claims, (tx) =>
      tx.parishPermissionOverride.findMany({ where: { parishId } }),
    );
    const mapped = mapOverrides(overrides);
    if (!canAccessSacramental(claims, 'write', mapped)) {
      await writeAuditEntry({
        requestId,
        actorUserId: claims.sub,
        actorLabel: claims.sub,
        action: 'membership.sacramental_record.create',
        entityType: 'member',
        entityId: memberId,
        outcome: AuditOutcome.DENIED,
        dioceseId: claims.app_metadata.diocese_id,
        parishId,
      });
      throw new ApiError(403, 'Forbidden');
    }

    const body = parseSacramentalBody(
      (await request.json()) as Record<string, unknown>,
    );

    const record = await withTenant(claims, async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: memberId, parishId },
        select: { id: true, parishId: true },
      });
      if (!member) throw new ApiError(404, 'Member not found');

      const created = await tx.sacramentalRecord.create({
        data: {
          parishId: member.parishId,
          memberId: member.id,
          sacramentType: body.sacramentType,
          occurredOn: body.occurredOn,
          officiantName: body.officiantName ?? null,
          locationText: body.locationText ?? null,
          registerBook: body.registerBook ?? null,
          registerPage: body.registerPage ?? null,
          registerEntry: body.registerEntry ?? null,
          notes: body.notes ?? null,
          sponsorNames: body.sponsorNames ?? null,
          spouseMemberId: body.spouseMemberId ?? null,
          spouseName: body.spouseName ?? null,
          witnessNames: body.witnessNames ?? null,
          ordainedOffice: body.ordainedOffice ?? null,
          pastoralNoteRef: body.pastoralNoteRef ?? null,
          createdByUserId: claims.sub,
        },
      });

      if (
        body.sacramentType === 'BAPTISM' ||
        body.sacramentType === 'CONFIRMATION'
      ) {
        await syncPastoralDatesFromRegister(tx, member.id, member.parishId);
      }

      return created;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: claims.sub,
      actorLabel: claims.sub,
      action: 'membership.sacramental_record.create',
      entityType: 'sacramental_record',
      entityId: record.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: record.parishId,
      metadata: { sacramentType: record.sacramentType, memberId },
    });

    return Response.json({ ok: true, record });
  });
