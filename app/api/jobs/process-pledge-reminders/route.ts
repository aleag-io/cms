import { handle } from '@/lib/api';
import { processPledgeReminders } from '@/lib/finance/pledgeReminders';

/**
 * Vercel Cron worker for lapsed-pledge reminders (§2.12). Shared-secret guarded
 * (not user auth); registered in vercel.json and the proxy public allowlist.
 */
async function runGuarded(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processPledgeReminders();
  return Response.json({ ok: true, ...result });
}

export const GET = (request: Request) => handle(() => runGuarded(request));
export const POST = (request: Request) => handle(() => runGuarded(request));
