/**
 * @phase:3
 *
 * Communications worker (Phase 3 exit gate item 3).
 *
 *   1. Enqueue via POST /api/messages → QUEUED recipients are created for the
 *      audience, minus anyone who opted out of the channel.
 *   2. processQueuedCommunications() drains the queue through a mocked provider
 *      → recipients become SENT and the provider is called exactly once each.
 *   3. The opted-out member never receives a recipient row, so is never sent to.
 *   4. Re-running the worker is idempotent — every recipient is sent at most once.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AudienceType,
  MessageChannel,
  MessageStatus,
  RecipientStatus,
} from '@prisma/client';
import { resetTestDb, testDb, FX } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import {
  setCommProvider,
  type CommProvider,
} from '@/lib/communications/providers';
import { processQueuedCommunications } from '@/lib/communications/worker';

let POST: (req: Request) => Promise<Response>;

async function loadRoute() {
  const mod = await import('@/app/api/messages/route');
  POST = mod.POST;
}

function makeRecordingProvider() {
  const sends: { destination: string }[] = [];
  const provider: CommProvider = {
    async send(channel, destination) {
      sends.push({ destination });
      return { providerMessageId: `mock-${channel}-${sends.length}` };
    },
  };
  return { provider, sends };
}

describe('POST /api/messages + communications worker', () => {
  let resetAuth: () => void;
  let resetProvider: () => void;

  beforeEach(async () => {
    await resetTestDb();
    await loadRoute();

    // Clergy A opts out of EMAIL; Alice stays subscribed.
    await testDb.communicationPreference.create({
      data: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        memberId: FX.members.clergyAId,
        channel: MessageChannel.EMAIL,
        optedOut: true,
      },
    });

    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);
  });

  afterEach(() => {
    resetAuth?.();
    resetProvider?.();
  });

  async function enqueueAllMembers() {
    const req = new Request('http://localhost/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: MessageChannel.EMAIL,
        subject: 'Parish news',
        body: 'Service this Sunday at 9am.',
        audienceType: AudienceType.ALL_MEMBERS,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    return res.json();
  }

  it('queues recipients minus opt-outs, then sends each exactly once', async () => {
    const { provider, sends } = makeRecordingProvider();
    resetProvider = setCommProvider(provider);

    const data = await enqueueAllMembers();
    // Active Parish-A members are Alice and Clergy; Clergy opted out.
    expect(data.queued).toBe(1);

    const queued = await testDb.messageRecipient.findMany({
      where: { messageId: data.message.id },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0].memberId).toBe(FX.members.aliceSmithId);
    expect(queued[0].status).toBe(RecipientStatus.QUEUED);

    // Opted-out member never got a recipient row at all.
    const clergyRows = await testDb.messageRecipient.findMany({
      where: { memberId: FX.members.clergyAId },
    });
    expect(clergyRows).toHaveLength(0);

    const first = await processQueuedCommunications();
    expect(first).toMatchObject({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sends).toEqual([{ destination: 'alice@test.local' }]);

    const sentRows = await testDb.messageRecipient.findMany({
      where: { messageId: data.message.id },
    });
    expect(sentRows[0].status).toBe(RecipientStatus.SENT);
    expect(sentRows[0].providerMessageId).toBeTruthy();

    // Message flips to SENT once all recipients are resolved.
    const message = await testDb.message.findUniqueOrThrow({
      where: { id: data.message.id },
    });
    expect(message.status).toBe(MessageStatus.SENT);

    // Idempotent: a second run claims nothing and sends nothing more.
    const second = await processQueuedCommunications();
    expect(second).toMatchObject({ claimed: 0, sent: 0 });
    expect(sends).toHaveLength(1);
  });

  it('marks recipients SKIPPED when a member opts out after enqueue', async () => {
    const { provider, sends } = makeRecordingProvider();
    resetProvider = setCommProvider(provider);

    const data = await enqueueAllMembers();
    expect(data.queued).toBe(1); // Alice queued.

    // Alice opts out before the worker runs.
    await testDb.communicationPreference.create({
      data: {
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
        memberId: FX.members.aliceSmithId,
        channel: MessageChannel.EMAIL,
        optedOut: true,
      },
    });

    const run = await processQueuedCommunications();
    expect(run).toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(sends).toHaveLength(0);

    const rows = await testDb.messageRecipient.findMany({
      where: { messageId: data.message.id },
    });
    expect(rows[0].status).toBe(RecipientStatus.SKIPPED);
    expect(rows[0].error).toBe('opted_out');
  });
});
