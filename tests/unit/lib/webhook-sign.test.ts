import { describe, it, expect } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '@/lib/webhooks/sign';
import {
  WEBHOOK_EVENTS,
  isWebhookEventType,
} from '@/lib/webhooks/events';
import { maskSecret } from '@/lib/webhooks/validate';

const SECRET = 'whsec_test_secret';
const TS = '1750000000';
const BODY = JSON.stringify({ id: 'd1', event: 'member.created', data: {} });

describe('webhook signatures', () => {
  it('round-trips a signature', () => {
    const signature = signWebhookPayload(SECRET, TS, BODY);
    expect(signature.startsWith('sha256=')).toBe(true);
    expect(verifyWebhookSignature(SECRET, TS, BODY, signature)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = signWebhookPayload(SECRET, TS, BODY);
    expect(
      verifyWebhookSignature(SECRET, TS, `${BODY} tampered`, signature),
    ).toBe(false);
  });

  it('rejects a replayed body under a different timestamp', () => {
    const signature = signWebhookPayload(SECRET, TS, BODY);
    expect(verifyWebhookSignature(SECRET, '1750009999', BODY, signature)).toBe(
      false,
    );
  });

  it('rejects a different secret', () => {
    const signature = signWebhookPayload(SECRET, TS, BODY);
    expect(verifyWebhookSignature('whsec_other', TS, BODY, signature)).toBe(
      false,
    );
  });

  it('rejects a malformed signature without throwing', () => {
    expect(verifyWebhookSignature(SECRET, TS, BODY, 'garbage')).toBe(false);
    expect(verifyWebhookSignature(SECRET, TS, BODY, '')).toBe(false);
  });
});

describe('webhook event catalog', () => {
  it('recognizes catalog entries and rejects others', () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(isWebhookEventType(event)).toBe(true);
    }
    expect(isWebhookEventType('member.deleted')).toBe(false);
    expect(isWebhookEventType('')).toBe(false);
  });
});

describe('maskSecret', () => {
  it('reveals only the last four characters', () => {
    const masked = maskSecret('whsec_abcdefghijkl');
    expect(masked).toBe('••••ijkl');
    expect(masked).not.toContain('abcdefgh');
  });
});
