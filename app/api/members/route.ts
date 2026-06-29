import { randomUUID } from 'node:crypto';
import { AuditOutcome, MemberStatus, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { deriveMemberIdentifier } from '@/lib/member-identifier';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.MEMBER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);

    const members = await withTenant(claims, (tx) =>
      tx.member.findMany({
        where: { parishId },
        include: { family: true },
        orderBy: [{ familyId: 'asc' }, { memberIdentifier: 'asc' }],
      }),
    );

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
    const parishId = requireParishId(actor.parishId);
    const claims = claimsFromUser(actor);

    const body = (await request.json()) as {
      familyId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      dateOfBirth?: string;
      status?: MemberStatus;
    };

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    if (!firstName || !lastName) {
      throw new ApiError(400, 'firstName and lastName are required');
    }

    const member = await withTenant(claims, async (tx) => {
      let family = null;
      if (body.familyId) {
        family = await tx.family.findFirst({
          where: { id: body.familyId, parishId },
        });
        if (!family) throw new ApiError(400, 'Family not found in current parish');
      }

      const inFamilyIndex = family
        ? (await tx.member.count({ where: { familyId: family.id } })) + 1
        : (await tx.member.count({ where: { parishId, familyId: null } })) + 1;

      const memberIdentifier = family
        ? deriveMemberIdentifier(family.familyNumber, inFamilyIndex)
        : `UNASSIGNED.${inFamilyIndex}`;

      return tx.member.create({
        data: {
          dioceseId: actor.dioceseId,
          parishId,
          familyId: family?.id ?? null,
          memberIdentifier,
          firstName,
          lastName,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          status: body.status ?? MemberStatus.ACTIVE,
        },
        include: { family: true },
      });
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
      parishId,
      metadata: { memberIdentifier: member.memberIdentifier },
    });

    return Response.json({ ok: true, member });
  });
