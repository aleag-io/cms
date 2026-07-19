import { createHmac, timingSafeEqual } from 'node:crypto';

// Signature scheme (documented for receivers in
// docs/releases/r6-reporting-integrations/2-integrations.md):
//   X-Webhook-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${body}`)>
// The timestamp is part of the signed material so a captured body cannot be
// replayed under a different timestamp header.

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `sha256=${mac}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
