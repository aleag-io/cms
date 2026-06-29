import { randomUUID } from 'node:crypto';
import { AuditOutcome, MemberStatus, Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';

function requireParishScope(
  parishId: string | null,
): asserts parishId is string {
  if (!parishId) {
    throw new Error('Parish scope required');
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<'/api/members/[id]'>,
) {
  const requestId = randomUUID();
  const actor = await requireRole([
    Role.DIOCESE_ADMIN,
    Role.PARISH_ADMIN,
    Role.PARISH_STAFF,
  ]);

  requireParishScope(actor.parishId);

  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: MemberStatus;
    phone?: string;
    email?: string;
  };

  const existing = await prisma.member.findFirst({
    where: {
      id,
      parishId: actor.parishId,
      dioceseId: actor.dioceseId,
    },
  });

  if (!existing) {
    return Response.json(
      { ok: false, error: 'Member not found' },
      { status: 404 },
    );
  }

  const member = await prisma.member.update({
    where: { id },
    data: {
      status: body.status,
      phone: body.phone?.trim(),
      email: body.email?.trim(),
    },
  });

  await writeAuditEntry({
    requestId,
    actorUserId: actor.id,
    actorLabel: actor.email,
    action: 'membership.member.update',
    entityType: 'member',
    entityId: member.id,
    outcome: AuditOutcome.SUCCESS,
    dioceseId: actor.dioceseId,
    parishId: actor.parishId,
  });

  return Response.json({ ok: true, member });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/members/[id]'>,
) {
  const requestId = randomUUID();
  const actor = await requireRole([Role.DIOCESE_ADMIN, Role.PARISH_ADMIN]);

  requireParishScope(actor.parishId);

  const { id } = await context.params;

  const existing = await prisma.member.findFirst({
    where: {
      id,
      parishId: actor.parishId,
      dioceseId: actor.dioceseId,
    },
  });

  if (!existing) {
    return Response.json(
      { ok: false, error: 'Member not found' },
      { status: 404 },
    );
  }

  await prisma.member.delete({ where: { id } });

  await writeAuditEntry({
    requestId,
    actorUserId: actor.id,
    actorLabel: actor.email,
    action: 'membership.member.delete',
    entityType: 'member',
    entityId: id,
    outcome: AuditOutcome.SUCCESS,
    dioceseId: actor.dioceseId,
    parishId: actor.parishId,
  });

  return Response.json({ ok: true });
}
