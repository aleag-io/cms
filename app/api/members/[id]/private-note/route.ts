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
    const { user, claims } = await requireClaimRole(['clergy']);
    const { id } = await context.params;

    const note = await withTenant(claims, (tx) =>
      tx.memberPrivateNote.findFirst({ where: { memberId: id } }),
    );

    if (!note) throw new ApiError(404, 'Private note not found');

    await writeAuditEntry({
      requestId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'membership.member_private_note.read',
      entityType: 'member',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: user.dioceseId,
      parishId: note.parishId,
    });

    return Response.json({ ok: true, privateNote: note.note });
  });

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  handle(async () => {
    const requestId = randomUUID();
    const { user, claims } = await requireClaimRole(['clergy']);
    const { id } = await context.params;
    const body = (await request.json()) as { note?: string };
    const note = body.note?.trim();
    if (!note) throw new ApiError(400, 'note is required');

    const member = await withTenant(claims, (tx) =>
      tx.member.findFirst({
        where: { id },
        select: { id: true, parishId: true },
      }),
    );
    if (!member) throw new ApiError(404, 'Member not found');

    const privateNote = await withTenant(claims, (tx) =>
      tx.memberPrivateNote.upsert({
        where: { memberId: id },
        update: { note },
        create: { memberId: id, parishId: member.parishId, note },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: 'membership.member_private_note.write',
      entityType: 'member',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: user.dioceseId,
      parishId: privateNote.parishId,
    });

    return Response.json({ ok: true, privateNote: privateNote.note });
  });
