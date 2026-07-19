import { handle } from '@/lib/api';
import { processWebhookQueue } from '@/lib/webhooks/worker';

/**
 * Vercel Cron worker endpoint (IN-2). Same shape as the communications worker:
 * guarded by CRON_SECRET rather than user auth, registered in vercel.json and
 * allowlisted in proxy.ts. Fans out the webhook outbox and delivers due rows.
 */
async function runGuarded(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!expected || provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processWebhookQueue();
  return Response.json({ ok: true, ...result });
}

export const GET = (request: Request) => handle(() => runGuarded(request));
export const POST = (request: Request) => handle(() => runGuarded(request));
