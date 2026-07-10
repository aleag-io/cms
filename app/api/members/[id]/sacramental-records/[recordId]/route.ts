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
import { parseSacramentalPatch } from '@/lib/sacramental/validate';
import { syncPastoralDatesFromRegister } from '@/lib/sacramental/sync-pastoral';

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string; recordId: string }> },
) =>
  handle(async () => {
    const claims = await requireSessionClaims();
    const { id: memberId, recordId } = await context.params;
    const parishId = claims.app_metadata.parish_id;

    const overrides = parishId
      ? await withTenant(claims, (tx) =>
          tx.parishPermissionOverride.findMany({ where: { parishId } }),
        )
      : [];
    const mapped = mapOverrides(overrides);

    if (!canReadMemberSacramental(claims, memberId, mapped)) {
      throw new ApiError(404, 'Record not found');
    }

    const record = await withTenant(claims, (tx) =>
      tx.sacramentalRecord.findFirst({
        where: { id: recordId, memberId },
      }),
    );
    if (!record) throw new ApiError(404, 'Record not found');

    return Response.json({ ok: true, record });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string; recordId: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const claims = await requireSessionClaims();
    const { id: memberId, recordId } = await context.params;
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
        action: 'membership.sacramental_record.update',
        entityType: 'sacramental_record',
        entityId: recordId,
        outcome: AuditOutcome.DENIED,
        dioceseId: claims.app_metadata.diocese_id,
        parishId,
      });
      throw new ApiError(403, 'Forbidden');
    }

    const patch = parseSacramentalPatch(
      (await request.json()) as Record<string, unknown>,
    );

    const record = await withTenant(claims, async (tx) => {
      const existing = await tx.sacramentalRecord.findFirst({
        where: { id: recordId, memberId, parishId },
      });
      if (!existing) throw new ApiError(404, 'Record not found');

      const updated = await tx.sacramentalRecord.update({
        where: { id: recordId },
        data: {
          ...(patch.sacramentType !== undefined && {
            sacramentType: patch.sacramentType,
          }),
          ...(patch.occurredOn !== undefined && {
            occurredOn: patch.occurredOn,
          }),
          ...(patch.isActive !== undefined && { isActive: patch.isActive }),
          ...(patch.officiantName !== undefined && {
            officiantName: patch.officiantName,
          }),
          ...(patch.locationText !== undefined && {
            locationText: patch.locationText,
          }),
          ...(patch.registerBook !== undefined && {
            registerBook: patch.registerBook,
          }),
          ...(patch.registerPage !== undefined && {
            registerPage: patch.registerPage,
          }),
          ...(patch.registerEntry !== undefined && {
            registerEntry: patch.registerEntry,
          }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
          ...(patch.sponsorNames !== undefined && {
            sponsorNames: patch.sponsorNames,
          }),
          ...(patch.spouseMemberId !== undefined && {
            spouseMemberId: patch.spouseMemberId,
          }),
          ...(patch.spouseName !== undefined && { spouseName: patch.spouseName }),
          ...(patch.witnessNames !== undefined && {
            witnessNames: patch.witnessNames,
          }),
          ...(patch.ordainedOffice !== undefined && {
            ordainedOffice: patch.ordainedOffice,
          }),
          ...(patch.pastoralNoteRef !== undefined && {
            pastoralNoteRef: patch.pastoralNoteRef,
          }),
        },
      });

      await syncPastoralDatesFromRegister(tx, memberId, parishId);
      return updated;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: claims.sub,
      actorLabel: claims.sub,
      action: 'membership.sacramental_record.update',
      entityType: 'sacramental_record',
      entityId: record.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: record.parishId,
    });

    return Response.json({ ok: true, record });
  });

export const DELETE = (
  _request: Request,
  context: { params: Promise<{ id: string; recordId: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const claims = await requireSessionClaims();
    const { id: memberId, recordId } = await context.params;
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
        action: 'membership.sacramental_record.deactivate',
        entityType: 'sacramental_record',
        entityId: recordId,
        outcome: AuditOutcome.DENIED,
        dioceseId: claims.app_metadata.diocese_id,
        parishId,
      });
      throw new ApiError(403, 'Forbidden');
    }

    const record = await withTenant(claims, async (tx) => {
      const existing = await tx.sacramentalRecord.findFirst({
        where: { id: recordId, memberId, parishId },
      });
      if (!existing) throw new ApiError(404, 'Record not found');

      const updated = await tx.sacramentalRecord.update({
        where: { id: recordId },
        data: { isActive: false },
      });
      await syncPastoralDatesFromRegister(tx, memberId, parishId);
      return updated;
    });

    await writeAuditEntry({
      requestId,
      actorUserId: claims.sub,
      actorLabel: claims.sub,
      action: 'membership.sacramental_record.deactivate',
      entityType: 'sacramental_record',
      entityId: record.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: claims.app_metadata.diocese_id,
      parishId: record.parishId,
    });

    return Response.json({ ok: true, record });
  });
