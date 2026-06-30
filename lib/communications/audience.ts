import { MessageChannel } from '@prisma/client';

/**
 * Audience → recipient resolution (PA-8).
 *
 * Pure function: given the candidate members for an audience and their
 * communication preferences, return the members who should receive a message
 * on `channel`, with opted-out members removed. Opt-out is enforced here (at
 * enqueue) and re-checked at send for race safety.
 */

export interface AudienceMember {
  memberId: string;
  email?: string | null;
  phone?: string | null;
}

export interface OptOutPref {
  memberId: string;
  channel: MessageChannel;
  optedOut: boolean;
}

export interface ResolvedRecipient {
  memberId: string;
  destination: string;
}

export function resolveRecipients(
  members: AudienceMember[],
  prefs: OptOutPref[],
  channel: MessageChannel,
): ResolvedRecipient[] {
  const optedOut = new Set(
    prefs
      .filter((p) => p.channel === channel && p.optedOut)
      .map((p) => p.memberId),
  );

  const seen = new Set<string>();
  const recipients: ResolvedRecipient[] = [];

  for (const member of members) {
    if (optedOut.has(member.memberId)) continue;
    if (seen.has(member.memberId)) continue;

    const destination =
      channel === MessageChannel.EMAIL ? member.email : member.phone;
    if (!destination) continue; // no reachable address on this channel

    seen.add(member.memberId);
    recipients.push({ memberId: member.memberId, destination });
  }

  return recipients;
}
