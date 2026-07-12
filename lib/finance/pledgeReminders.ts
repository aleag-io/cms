/**
 * Lapsed/unfulfilled pledge reminders (§2.12). Reuses the M7 communications
 * queue rather than a new channel: one QUEUED Message + MessageRecipient per
 * pledge; the existing worker (processQueuedCommunications) sends it and honors
 * CommunicationPreference opt-out. Runs privileged (cron/manual), no session.
 */

import { AuditOutcome } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { randomUUID } from 'node:crypto';

export type PledgeReminderResult = { reminded: number; skipped: number };

export async function processPledgeReminders(opts?: {
  lookaheadDays?: number;
  onlyPledgeId?: string;
}): Promise<PledgeReminderResult> {
  const lookaheadDays = opts?.lookaheadDays ?? 30;
  const cutoff = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000);

  const pledges = await prisma.pledge.findMany({
    where: {
      status: 'ACTIVE',
      parishId: { not: null },
      ...(opts?.onlyPledgeId ? { id: opts.onlyPledgeId } : {}),
      campaign: { endDate: { lte: cutoff } },
    },
    include: {
      campaign: { select: { name: true } },
      member: { select: { id: true, email: true } },
      family: {
        select: {
          primaryContactEmail: true,
          members: { select: { id: true, email: true }, take: 1 },
        },
      },
    },
  });

  let reminded = 0;
  let skipped = 0;
  for (const p of pledges) {
    if (p.fulfilledCents >= p.amountCents || !p.parishId) {
      skipped++;
      continue;
    }
    // Resolve a member to attribute the reminder to + a destination email.
    const member = p.member ?? p.family?.members[0] ?? null;
    const destination = p.member?.email ?? p.family?.primaryContactEmail ?? null;
    if (!member || !destination) {
      skipped++;
      continue;
    }

    const remaining = p.amountCents - p.fulfilledCents;
    await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          dioceseId: p.dioceseId,
          parishId: p.parishId!,
          channel: 'EMAIL',
          subject: `Pledge reminder — ${p.campaign.name}`,
          body: `This is a friendly reminder about your pledge to ${p.campaign.name}. Thank you for your continued generosity.`,
          audienceType: 'CUSTOM',
          status: 'QUEUED',
        },
      });
      await tx.messageRecipient.create({
        data: {
          dioceseId: p.dioceseId,
          parishId: p.parishId!,
          messageId: message.id,
          memberId: member.id,
          channel: 'EMAIL',
          destination,
        },
      });
      await tx.pledge.update({
        where: { id: p.id },
        data: { lastRemindedAt: new Date() },
      });
    });

    await writeAuditEntry({
      requestId: randomUUID(),
      actorLabel: 'pledge-reminder-cron',
      action: 'finance.pledge.reminder',
      entityType: 'finance_pledge',
      entityId: p.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: p.dioceseId,
      parishId: p.parishId,
      metadata: { remainingCents: remaining.toString() },
    });
    reminded++;
  }

  return { reminded, skipped };
}
