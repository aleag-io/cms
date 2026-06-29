import { randomUUID } from 'node:crypto';
import { AuditOutcome, MemberStatus, Role } from '@prisma/client';
import { requireRole, claimsFromUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { deriveMemberIdentifier } from '@/lib/member-identifier';
import { projectDirectoryMember, projectMember } from '@/lib/projection';

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
    const claims = await claimsFromUser(actor);
    const roles = claims.app_metadata.roles;

    if (actor.role === Role.MEMBER) {
      const directoryRows = await withTenant(claims, (tx) =>
        tx.$queryRaw<
          Array<{
            id: string;
            parishId: string;
            memberIdentifier: string;
            firstName: string;
            lastName: string;
            email: string | null;
            phone: string | null;
            status: string;
          }>
        >`SELECT id, "parishId", "memberIdentifier", "firstName", "lastName", email, phone, status::text as status FROM parish_member_directory WHERE "parishId" = ${parishId}`,
      );
      return Response.json({
        ok: true,
        members: directoryRows.map((row) => projectDirectoryMember(row)),
      });
    }

    const members = await withTenant(claims, (tx) =>
      tx.member.findMany({
        where: { parishId },
        include: { family: true, privateNote: true, pastoralData: true },
        orderBy: [{ familyId: 'asc' }, { memberIdentifier: 'asc' }],
      }),
    );

    return Response.json({
      ok: true,
      members: members.map((member) => projectMember(member, roles)),
    });
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
    const claims = await claimsFromUser(actor);

    const body = (await request.json()) as {
      familyId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      workNotes?: string;
      educationLevel?:
        | 'PRIMARY'
        | 'SECONDARY'
        | 'UNDERGRADUATE'
        | 'POSTGRADUATE'
        | 'OTHER'
        | null;
      skillsInterests?: string[];
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
          workNotes: body.workNotes?.trim() || null,
          educationLevel: body.educationLevel ?? null,
          skillsInterests: body.skillsInterests?.map((value) => value.trim()).filter(Boolean) ?? [],
          status: body.status ?? MemberStatus.ACTIVE,
        },
        include: { family: true, privateNote: true, pastoralData: true },
      });
    });

    await withTenant(claims, async (tx) => {
      await tx.memberParish.upsert({
        where: {
          memberId_parishId: {
            memberId: member.id,
            parishId,
          },
        },
        update: { isPrimary: true, membershipType: 'PRIMARY' },
        create: {
          memberId: member.id,
          parishId,
          isPrimary: true,
          membershipType: 'PRIMARY',
        },
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

    return Response.json({
      ok: true,
      member: projectMember(member, claims.app_metadata.roles),
    });
  });
