import { handle } from '@/lib/api';
import { processQueuedCommunications } from '@/lib/communications/worker';

/**
 * Vercel Cron worker endpoint (PA-8). Guarded by a shared secret, not user
 * auth — it is registered in vercel.json and added to the proxy public
 * allowlist so it bypasses the session gate. Drains the QUEUED communication
 * queue idempotently.
 *
 * Vercel Cron invokes the path with a GET request, automatically attaching
 * `Authorization: Bearer ${CRON_SECRET}`; POST is kept for manual/local
 * triggering with the same secret.
 */
async function runGuarded(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!expected || provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processQueuedCommunications();
  return Response.json({ ok: true, ...result });
}

export const GET = (request: Request) => handle(() => runGuarded(request));
export const POST = (request: Request) => handle(() => runGuarded(request));
