import { randomUUID } from 'node:crypto';
import { AuditOutcome, MessageChannel } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

/**
 * Member self-service communication preferences (Phase 9, MM-8/PA-8).
 *
 * A member reads and sets their OWN per-channel opt-in/out. Row scope is
 * enforced by the comm_pref_self_rw RLS policy (memberId must match the
 * member_id claim); the composer honors these rows at enqueue and send
 * (lib/communications/audience.ts).
 */

function requireMemberId(memberId: string | null | undefined): string {
  if (!memberId) {
    throw new ApiError(400, 'No member record is linked to your account');
  }
  return memberId;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);
    const memberId = requireMemberId(claims.app_metadata.member_id);

    const rows = await withTenant(claims, (tx) =>
      tx.communicationPreference.findMany({
        where: { memberId },
        orderBy: { channel: 'asc' },
      }),
    );

    // Absent row = opted in (default). Materialize both channels for the UI.
    const preferences = Object.values(MessageChannel).map((channel) => ({
      channel,
      optedOut: rows.find((row) => row.channel === channel)?.optedOut ?? false,
    }));

    return Response.json({ ok: true, preferences });
  });

export const PUT = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireSessionUser();
    const claims = await claimsFromUser(actor);
    const memberId = requireMemberId(claims.app_metadata.member_id);
    const parishId = actor.parishId;
    if (!parishId) throw new ApiError(400, 'Parish scope required');

    const body = (await request.json()) as {
      preferences?: { channel?: string; optedOut?: boolean }[];
    };
    if (!Array.isArray(body.preferences) || body.preferences.length === 0) {
      throw new ApiError(400, 'preferences array is required');
    }

    const channels = Object.values(MessageChannel) as string[];
    for (const pref of body.preferences) {
      if (!pref.channel || !channels.includes(pref.channel)) {
        throw new ApiError(400, `channel must be one of: ${channels.join(', ')}`);
      }
      if (typeof pref.optedOut !== 'boolean') {
        throw new ApiError(400, 'optedOut must be a boolean');
      }
    }

    const updated = await withTenant(claims, async (tx) => {
      for (const pref of body.preferences!) {
        await tx.communicationPreference.upsert({
          where: {
            memberId_channel: {
              memberId,
              channel: pref.channel as MessageChannel,
            },
          },
          update: { optedOut: pref.optedOut! },
          create: {
            dioceseId: actor.dioceseId,
            parishId,
            memberId,
            channel: pref.channel as MessageChannel,
            optedOut: pref.optedOut!,
          },
        });
      }
      return tx.communicationPreference.findMany({
        where: { memberId },
        orderBy: { channel: 'asc' },
      });
    });

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'communications.preference.update',
      entityType: 'communication_preference',
      entityId: memberId,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        preferences: body.preferences.map((pref) => ({
          channel: pref.channel,
          optedOut: pref.optedOut,
        })),
      },
    });

    return Response.json({
      ok: true,
      preferences: updated.map((row) => ({
        channel: row.channel,
        optedOut: row.optedOut,
      })),
    });
  });
