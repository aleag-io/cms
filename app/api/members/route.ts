import { randomUUID } from 'node:crypto';
import { AuditOutcome, MemberStatus, Role } from '@prisma/client';
import { requireRole, requireSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishScope(
  parishId: string | null,
): asserts parishId is string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
}

export const GET = () =>
  handle(async () => {
    const user = await requireSessionUser();
    requireParishScope(user.parishId);

    const members = await prisma.member.findMany({
      where: { dioceseId: user.dioceseId, parishId: user.parishId },
      include: { family: true },
      orderBy: [{ familyId: 'asc' }, { memberIdentifier: 'asc' }],
    });

    return Response.json({ ok: true, members });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
    ]);

    requireParishScope(actor.parishId);

    const body = (await request.json()) as {
      familyId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      status?: MemberStatus;
    };

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();

    if (!firstName || !lastName) {
      throw new ApiError(400, 'firstName and lastName are required');
    }

    let family = null;
    if (body.familyId) {
      family = await prisma.family.findFirst({
        where: { id: body.familyId, parishId: actor.parishId },
      });

      if (!family) {
        throw new ApiError(400, 'family not found in current parish');
      }
    }

    const inFamilySequence = family
      ? (await prisma.member.count({ where: { familyId: family.id } })) + 1
      : (await prisma.member.count({ where: { parishId: actor.parishId } })) + 1;

    const memberIdentifier = family
      ? `${family.familyNumber}.${inFamilySequence}`
      : `UNASSIGNED.${inFamilySequence}`;

    const member = await prisma.member.create({
      data: {
        dioceseId: actor.dioceseId,
        parishId: actor.parishId,
        familyId: family?.id,
        memberIdentifier,
        firstName,
        lastName,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        status: body.status ?? MemberStatus.ACTIVE,
      },
      include: { family: true },
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'membership.member.create',
      entityType: 'member',
      entityId: member.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: { memberIdentifier: member.memberIdentifier },
    });

    return Response.json({ ok: true, member });
  });
