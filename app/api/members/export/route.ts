import { Role } from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { projectMember } from '@/lib/projection';

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.DIOCESE_ADMIN,
      Role.PARISH_ADMIN,
      Role.PARISH_STAFF,
      Role.CLERGY,
      Role.PASTORAL_DATA_ACCESSOR,
      Role.MEMBER,
    ]);
    const claims = await claimsFromUser(actor);
    const parishId = claims.app_metadata.parish_id;
    if (!parishId) {
      return Response.json({ ok: true, members: [] });
    }

    const rows = await withTenant(claims, (tx) =>
      tx.member.findMany({
        where: { parishId },
        include: { family: true, privateNote: true, pastoralData: true },
        orderBy: [{ familyId: 'asc' }, { memberIdentifier: 'asc' }],
      }),
    );

    const members = rows.map((row) => {
      const projected = projectMember(row, claims.app_metadata.roles);
      return {
        id: projected.id,
        memberIdentifier: projected.memberIdentifier,
        firstName: projected.firstName,
        lastName: projected.lastName,
        email: projected.email,
        phone: projected.phone,
        status: projected.status,
        familyName:
          projected.family && typeof projected.family === 'object' && projected.family !== null && 'familyName' in projected.family
            ? String(projected.family.familyName)
            : null,
      };
    });

    return Response.json({ ok: true, members });
  });
