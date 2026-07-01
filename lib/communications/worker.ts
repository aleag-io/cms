import { MessageStatus, RecipientStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCommProvider } from '@/lib/communications/providers';

/**
 * Communications worker (PA-8) — drains QUEUED MessageRecipient rows.
 *
 * Runs as a trusted system job (Vercel Cron → /api/jobs/process-communications,
 * secret-guarded), not under user auth, so it uses the privileged client like
 * audit writes. Guarantees from the plan:
 *   - claims a batch with FOR UPDATE SKIP LOCKED and commits the claim before
 *     network I/O, so DB locks are short-lived and concurrent invocations take
 *     disjoint sets;
 *   - one-way QUEUED/expired PROCESSING → PROCESSING → SENT/SKIPPED/FAILED
 *     transition, with recipient id as the provider idempotency key;
 *   - re-checks opt-out at send for race safety.
 */

export interface ProcessResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function processQueuedCommunications(opts?: {
  batchSize?: number;
}): Promise<ProcessResult> {
  const batchSize = opts?.batchSize ?? 100;
  const provider = getCommProvider();
  const result: ProcessResult = { claimed: 0, sent: 0, skipped: 0, failed: 0 };

  const rows = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string;
        messageId: string;
        memberId: string;
        channel: 'EMAIL' | 'SMS';
        destination: string | null;
      }[]
    >`
      SELECT id, "messageId", "memberId", channel, destination
      FROM "MessageRecipient"
      WHERE status = 'QUEUED'
         OR (status = 'PROCESSING' AND "updatedAt" < now() - interval '15 minutes')
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `;

    result.claimed = rows.length;
    if (rows.length > 0) {
      await tx.messageRecipient.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { status: RecipientStatus.PROCESSING, error: null },
      });
    }

    return rows;
  });

  const messageIds = new Set<string>();

  for (const row of rows) {
    messageIds.add(row.messageId);

    // Re-check opt-out at send time (race safety).
    const pref = await prisma.communicationPreference.findUnique({
      where: {
        memberId_channel: { memberId: row.memberId, channel: row.channel },
      },
    });

    if (pref?.optedOut || !row.destination) {
      await prisma.messageRecipient.update({
        where: { id: row.id },
        data: {
          status: RecipientStatus.SKIPPED,
          error: pref?.optedOut ? 'opted_out' : 'no_destination',
        },
      });
      result.skipped++;
      continue;
    }

    const message = await prisma.message.findUnique({
      where: { id: row.messageId },
      select: { subject: true, body: true },
    });

    try {
      const sent = await provider.send(row.channel, row.destination, {
        subject: message?.subject ?? null,
        body: message?.body ?? '',
        idempotencyKey: row.id,
      });
      await prisma.messageRecipient.update({
        where: { id: row.id },
        data: {
          status: RecipientStatus.SENT,
          providerMessageId: sent.providerMessageId,
          sentAt: new Date(),
          error: null,
        },
      });
      result.sent++;
    } catch (err) {
      await prisma.messageRecipient.update({
        where: { id: row.id },
        data: {
          status: RecipientStatus.FAILED,
          error: err instanceof Error ? err.message : 'send_failed',
        },
      });
      result.failed++;
    }
  }

  // Mark messages whose recipients are now fully resolved as SENT.
  for (const messageId of messageIds) {
    const remaining = await prisma.messageRecipient.count({
      where: {
        messageId,
        status: { in: [RecipientStatus.QUEUED, RecipientStatus.PROCESSING] },
      },
    });
    if (remaining === 0) {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.SENT },
      });
    }
  }

  return result;
}
