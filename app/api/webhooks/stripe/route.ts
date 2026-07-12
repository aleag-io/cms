import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { AuditOutcome } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { ingestStripeEvent } from '@/lib/finance/stripe';

export const dynamic = 'force-dynamic';

type StripeLikeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

async function verifyEvent(raw: string, sig: string | null): Promise<StripeLikeEvent> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && secret !== 'replace-me') {
    if (!sig) throw new ApiError(400, 'Missing stripe-signature header');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder');
    try {
      return (await stripe.webhooks.constructEventAsync(
        raw,
        sig,
        secret,
      )) as unknown as StripeLikeEvent;
    } catch {
      throw new ApiError(400, 'Invalid Stripe signature');
    }
  }
  // No secret configured (local/dev): accept the JSON body as-is.
  try {
    return JSON.parse(raw) as StripeLikeEvent;
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
}

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const raw = await request.text();
    const event = await verifyEvent(raw, request.headers.get('stripe-signature'));

    const obj = event.data?.object ?? {};
    const amount =
      (obj.amount_total as number | undefined) ??
      (obj.amount_received as number | undefined) ??
      (obj.amount as number | undefined) ??
      0;
    const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};

    const result = await ingestStripeEvent(prisma, {
      id: event.id,
      type: event.type,
      amountCents: BigInt(Math.round(amount)),
      metadata,
    });

    if (result.created) {
      await writeAuditEntry({
        requestId,
        actorUserId: metadata.createdByUserId ?? null,
        actorLabel: 'stripe-webhook',
        action: 'finance.stripe.ingest',
        entityType: 'finance_donation',
        entityId: result.donationId ?? event.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId: metadata.dioceseId ?? null,
        parishId: metadata.parishId ?? null,
        metadata: { stripeEventId: event.id, type: event.type },
      });
    }

    // Always 200 so Stripe stops retrying (idempotent no-op on replays).
    return Response.json({ ok: true, ...result });
  });
