import { getSessionUser, claimsFromUser } from '@/lib/auth';
import { ApiError, handle } from '@/lib/api';

export const GET = () =>
  handle(async () => {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, 'Unauthorized');
    const claims = await claimsFromUser(user);
    return Response.json({ ok: true, claims });
  });
