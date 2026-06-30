import { describe, expect, it } from 'vitest';
import { MessageChannel } from '@prisma/client';
import { resolveRecipients } from '@/lib/communications/audience';

const members = [
  { memberId: 'm1', email: 'a@x.test', phone: '+1001' },
  { memberId: 'm2', email: 'b@x.test', phone: '+1002' },
  { memberId: 'm3', email: null, phone: '+1003' },
];

describe('resolveRecipients (PA-8)', () => {
  it('removes opted-out members for the channel', () => {
    const prefs = [
      { memberId: 'm2', channel: MessageChannel.EMAIL, optedOut: true },
    ];
    const out = resolveRecipients(members, prefs, MessageChannel.EMAIL);
    expect(out.map((r) => r.memberId)).toEqual(['m1']); // m2 opted out, m3 no email
  });

  it('ignores opt-outs on a different channel', () => {
    const prefs = [
      { memberId: 'm2', channel: MessageChannel.SMS, optedOut: true },
    ];
    const out = resolveRecipients(members, prefs, MessageChannel.EMAIL);
    expect(out.map((r) => r.memberId)).toEqual(['m1', 'm2']);
  });

  it('skips members with no destination on the channel', () => {
    const out = resolveRecipients(members, [], MessageChannel.EMAIL);
    expect(out.map((r) => r.memberId)).toEqual(['m1', 'm2']); // m3 has no email
  });

  it('uses phone for the SMS channel and dedupes', () => {
    const dup = [...members, members[0]];
    const out = resolveRecipients(dup, [], MessageChannel.SMS);
    expect(out.map((r) => r.destination)).toEqual(['+1001', '+1002', '+1003']);
  });
});
