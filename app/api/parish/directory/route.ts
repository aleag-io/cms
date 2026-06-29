import { requireClaimRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { handle } from '@/lib/api';
import { projectDirectoryMember } from '@/lib/projection';

export const GET = () =>
  handle(async () => {
    const { claims } = await requireClaimRole([
      'member',
      'parish_staff',
      'parish_admin',
      'clergy',
      'pastoral_data_accessor',
    ]);

    const parishId = claims.app_metadata.parish_id;
    if (!parishId) {
      return Response.json({ ok: true, members: [] });
    }

    const members = await withTenant(claims, (tx) =>
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
      >`SELECT id, "parishId", "memberIdentifier", "firstName", "lastName", email, phone, status::text as status FROM parish_member_directory WHERE "parishId" = ${parishId} ORDER BY "lastName", "firstName"`,
    );

    return Response.json({
      ok: true,
      members: members.map((member) => projectDirectoryMember(member)),
    });
  });
