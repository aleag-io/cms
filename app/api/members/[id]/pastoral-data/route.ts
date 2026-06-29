import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { requireClaimRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

export const GET = (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { user, claims } = await requireClaimRole([
      'clergy',
      'parish_admin',
      'pastoral_data_accessor',
    ]);
    const { id } = await context.params;

    const pastoralData = await withTenant(claims, (tx) =>
      tx.memberPastoralData.findFirst({ where: { memberId: id } }),
    );
    if (!pastoralData) throw new ApiError(404, 'Pastoral data not found');

    await writeAuditEntry({
      requestId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'membership.member_pastoral_data.read',
      entityType: 'member',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: user.dioceseId,
      parishId: pastoralData.parishId,
    });

    return Response.json({ ok: true, pastoralData });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { user, claims } = await requireClaimRole([
      'clergy',
      'parish_admin',
      'pastoral_data_accessor',
    ]);
    const { id } = await context.params;
    const body = (await request.json()) as {
      dateOfBirth?: string | null;
      baptismDate?: string | null;
      chrismationDate?: string | null;
    };

    const member = await withTenant(claims, (tx) =>
      tx.member.findFirst({
        where: { id },
        select: { id: true, parishId: true },
      }),
    );
    if (!member) throw new ApiError(404, 'Member not found');

    const pastoralData = await withTenant(claims, (tx) =>
      tx.memberPastoralData.upsert({
        where: { memberId: id },
        update: {
          ...(body.dateOfBirth !== undefined && {
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          }),
          ...(body.baptismDate !== undefined && {
            baptismDate: body.baptismDate ? new Date(body.baptismDate) : null,
          }),
          ...(body.chrismationDate !== undefined && {
            chrismationDate: body.chrismationDate
              ? new Date(body.chrismationDate)
              : null,
          }),
        },
        create: {
          memberId: id,
          parishId: member.parishId,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          baptismDate: body.baptismDate ? new Date(body.baptismDate) : null,
          chrismationDate: body.chrismationDate
            ? new Date(body.chrismationDate)
            : null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'membership.member_pastoral_data.write',
      entityType: 'member',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: user.dioceseId,
      parishId: pastoralData.parishId,
    });

    return Response.json({ ok: true, pastoralData });
  });
