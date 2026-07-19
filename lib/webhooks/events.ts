// R6 / M12 — the canonical outbound webhook event catalog.
//
// Payloads are deliberately THIN: ids plus non-sensitive scalars only. No
// names, emails, notes, pastoral dates, or donor attribution ever cross this
// boundary, so a webhook body can never become a PII side channel. Receivers
// that need detail call back through an authenticated API.
//
// Emission points (each inside the same withTenant transaction as its domain
// write, via emitWebhookEvent):
//   member.created           app/api/members/route.ts POST
//                            app/api/registrations/[id]/route.ts (approval)
//   member.updated           app/api/members/[id]/route.ts PATCH
//   donation.posted          app/api/finance/donations/route.ts POST
//   donation_batch.posted    app/api/finance/donation-batches/[id]/post/route.ts
//   registration.approved    app/api/registrations/[id]/route.ts
//   event.created            app/api/events/route.ts POST

export const WEBHOOK_EVENTS = [
  'member.created',
  'member.updated',
  'donation.posted',
  'donation_batch.posted',
  'registration.approved',
  'event.created',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Event type used by the "send test" button; never stored on a subscription. */
export const WEBHOOK_TEST_EVENT = 'webhook.test';
