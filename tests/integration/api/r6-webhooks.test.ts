/**
 * Integration: outbound webhooks (IN-2).
 * Covers subscription CRUD (secret shown once, masked thereafter), outbox
 * emission from real domain routes with thin payloads, idempotent fan-out,
 * HMAC signing, and the retry/backoff/dead-letter ladder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb, FX, resetTestDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import { processWebhookQueue, MAX_ATTEMPTS } from '@/lib/webhooks/worker';
import { verifyWebhookSignature } from '@/lib/webhooks/sign';

let subs: typeof import('@/app/api/integrations/webhooks/route');
let subDetail: typeof import('@/app/api/integrations/webhooks/[id]/route');
let members: typeof import('@/app/api/members/route');

const jreq = (body: unknown, method = 'POST') =>
  new Request('http://localhost', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function createSubscription(events: string[] = ['member.created']) {
  const response = await subs.POST(
    jreq({ name: 'Receiver', url: 'https://example.com/hooks', events }),
  );
  return { status: response.status, body: await response.json() };
}

/** A fetch stub that records calls and returns a scripted status. */
function stubFetch(status: number | (() => number)) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      ),
      body: String(init?.body ?? ''),
    });
    const code = typeof status === 'function' ? status() : status;
    return new Response('', { status: code });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('R6 webhooks', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
    subs = await import('@/app/api/integrations/webhooks/route');
    subDetail = await import('@/app/api/integrations/webhooks/[id]/route');
    members = await import('@/app/api/members/route');
    resetAuth = asUser(
      await testDb.appUser.findUniqueOrThrow({
        where: { id: FX.users.parishAAdmin.id },
      }),
    );
  });
  afterEach(() => resetAuth?.());

  describe('subscription management', () => {
    it('returns the signing secret exactly once, masked thereafter', async () => {
      const { status, body } = await createSubscription();
      expect(status).toBe(201);
      expect(body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);

      const list = await (await subs.GET()).json();
      expect(list.subscriptions).toHaveLength(1);
      expect(list.subscriptions[0].secret).toBeUndefined();
      expect(list.subscriptions[0].secretPreview).toBe(
        `••••${body.secret.slice(-4)}`,
      );
      expect(JSON.stringify(list)).not.toContain(body.secret);
    });

    it('rejects non-https urls and unknown event types', async () => {
      const insecure = await subs.POST(
        jreq({
          name: 'x',
          url: 'http://evil.example.com/hooks',
          events: ['member.created'],
        }),
      );
      expect(insecure.status).toBe(400);

      const badEvent = await subs.POST(
        jreq({
          name: 'x',
          url: 'https://example.com/hooks',
          events: ['member.exploded'],
        }),
      );
      expect(badEvent.status).toBe(400);
      expect(await testDb.webhookSubscription.count()).toBe(0);
    });

    it('denies parish staff', async () => {
      const { body } = await createSubscription();
      resetAuth();
      resetAuth = asUser(
        await testDb.appUser.findUniqueOrThrow({
          where: { id: FX.users.parishAStaff.id },
        }),
      );

      expect((await subs.GET()).status).toBe(403);
      const patched = await subDetail.PATCH(jreq({ isActive: false }, 'PATCH'), {
        params: Promise.resolve({ id: body.subscription.id }),
      });
      expect(patched.status).toBe(403);
      const unchanged = await testDb.webhookSubscription.findUniqueOrThrow({
        where: { id: body.subscription.id },
      });
      expect(unchanged.isActive).toBe(true);
    });

    it('audits creation', async () => {
      const { body } = await createSubscription();
      const audit = await testDb.auditEntry.findFirst({
        where: {
          action: 'integration.webhook.created',
          entityId: body.subscription.id,
        },
      });
      expect(audit?.outcome).toBe('SUCCESS');
    });
  });

  describe('emission', () => {
    it('member creation writes a thin outbox event with no sensitive fields', async () => {
      await members.POST(
        jreq({
          firstName: 'Nora',
          lastName: 'Webhook',
          familyId: FX.families.smithId,
          workNotes: 'SENSITIVE_WORK_NOTE',
        }),
      );

      const events = await testDb.webhookEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('member.created');

      const payload = events[0].payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'memberId',
        'memberIdentifier',
        'parishId',
        'status',
      ]);
      expect(JSON.stringify(payload)).not.toContain('SENSITIVE_WORK_NOTE');
      expect(JSON.stringify(payload)).not.toContain('Nora');
    });

    it('emission succeeds for parish staff, who cannot read the outbox', async () => {
      resetAuth();
      resetAuth = asUser(
        await testDb.appUser.findUniqueOrThrow({
          where: { id: FX.users.parishAStaff.id },
        }),
      );
      const response = await members.POST(
        jreq({
          firstName: 'Staff',
          lastName: 'Created',
          familyId: FX.families.smithId,
        }),
      );
      expect(response.status).toBe(200);
      expect(await testDb.webhookEvent.count()).toBe(1);
    });
  });

  describe('fan-out and delivery', () => {
    async function seedSubscribedEvent(events = ['member.created']) {
      const { body } = await createSubscription(events);
      await members.POST(
        jreq({
          firstName: 'Fan',
          lastName: 'Out',
          familyId: FX.families.smithId,
        }),
      );
      return body;
    }

    it('creates one delivery per matching subscription only', async () => {
      await seedSubscribedEvent(['member.created']);
      // A second subscription that is NOT subscribed to member.created.
      await subs.POST(
        jreq({
          name: 'Other',
          url: 'https://example.com/other',
          events: ['event.created'],
        }),
      );

      const stub = stubFetch(200);
      const result = await processWebhookQueue({ fetchImpl: stub.impl });
      expect(result.fannedOut).toBe(1);
      expect(result.delivered).toBe(1);
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0].url).toBe('https://example.com/hooks');
    });

    it('is idempotent — re-running creates no duplicate deliveries', async () => {
      await seedSubscribedEvent();
      const first = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(first.fannedOut).toBe(1);

      const second = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(second.fannedOut).toBe(0);
      expect(second.claimed).toBe(0);
      expect(await testDb.webhookDelivery.count()).toBe(1);
    });

    it('signs the delivery so the receiver can verify it', async () => {
      const created = await seedSubscribedEvent();
      const stub = stubFetch(200);
      await processWebhookQueue({ fetchImpl: stub.impl });

      const call = stub.calls[0];
      expect(call.headers['x-webhook-event']).toBe('member.created');
      expect(
        verifyWebhookSignature(
          created.secret,
          call.headers['x-webhook-timestamp'],
          call.body,
          call.headers['x-webhook-signature'],
        ),
      ).toBe(true);

      // A receiver using the wrong secret must reject the same delivery.
      expect(
        verifyWebhookSignature(
          'whsec_wrong',
          call.headers['x-webhook-timestamp'],
          call.body,
          call.headers['x-webhook-signature'],
        ),
      ).toBe(false);

      const envelope = JSON.parse(call.body);
      expect(envelope.event).toBe('member.created');
      expect(envelope.data.memberIdentifier).toBeDefined();
    });

    it('marks DELIVERED on 2xx', async () => {
      await seedSubscribedEvent();
      await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      const delivery = await testDb.webhookDelivery.findFirstOrThrow();
      expect(delivery.status).toBe('DELIVERED');
      expect(delivery.responseStatus).toBe(200);
      expect(delivery.attemptCount).toBe(1);
      expect(delivery.deliveredAt).not.toBeNull();
    });

    it('backs off after a failure and retries when due', async () => {
      await seedSubscribedEvent();
      await processWebhookQueue({ fetchImpl: stubFetch(500).impl });

      let delivery = await testDb.webhookDelivery.findFirstOrThrow();
      expect(delivery.status).toBe('FAILED');
      expect(delivery.attemptCount).toBe(1);
      expect(delivery.lastError).toBe('HTTP 500');
      // Backoff is stamped from the database clock, so compare against it
      // rather than the app clock (the two can drift).
      const [{ now: dbNow }] = await testDb.$queryRaw<{ now: Date }[]>`SELECT now()`;
      expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(dbNow.getTime());

      // Not yet due → not claimed.
      const early = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(early.claimed).toBe(0);

      // Force it due, then a success clears the failure.
      await testDb.webhookDelivery.update({
        where: { id: delivery.id },
        data: { nextAttemptAt: new Date(Date.now() - 3_600_000) },
      });
      const retry = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(retry.delivered).toBe(1);

      delivery = await testDb.webhookDelivery.findFirstOrThrow();
      expect(delivery.status).toBe('DELIVERED');
      expect(delivery.attemptCount).toBe(2);
      expect(delivery.lastError).toBeNull();
    });

    it('dead-letters after the attempt ceiling', async () => {
      await seedSubscribedEvent();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        await processWebhookQueue({ fetchImpl: stubFetch(500).impl });
        await testDb.webhookDelivery.updateMany({
          data: { nextAttemptAt: new Date(Date.now() - 3_600_000) },
        });
      }
      const delivery = await testDb.webhookDelivery.findFirstOrThrow();
      expect(delivery.attemptCount).toBe(MAX_ATTEMPTS);
      expect(delivery.status).toBe('DEAD');
    });

    it('reclaims deliveries stuck in PROCESSING', async () => {
      await seedSubscribedEvent();
      await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      await testDb.webhookDelivery.updateMany({
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(Date.now() - 20 * 60_000),
        },
      });

      const result = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(result.claimed).toBe(1);
    });

    it('records a network failure without throwing', async () => {
      await seedSubscribedEvent();
      const failing = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      const result = await processWebhookQueue({ fetchImpl: failing });
      expect(result.failed).toBe(1);
      const delivery = await testDb.webhookDelivery.findFirstOrThrow();
      expect(delivery.status).toBe('FAILED');
      expect(delivery.lastError).toContain('ECONNREFUSED');
    });

    it('skips inactive subscriptions', async () => {
      const created = await createSubscription();
      await subDetail.PATCH(jreq({ isActive: false }, 'PATCH'), {
        params: Promise.resolve({ id: created.body.subscription.id }),
      });
      await members.POST(
        jreq({
          firstName: 'No',
          lastName: 'Delivery',
          familyId: FX.families.smithId,
        }),
      );

      const result = await processWebhookQueue({ fetchImpl: stubFetch(200).impl });
      expect(result.fannedOut).toBe(0);
      expect(await testDb.webhookDelivery.count()).toBe(0);
    });
  });
});
