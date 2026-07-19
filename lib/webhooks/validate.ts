import { randomBytes } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { isWebhookEventType, type WebhookEventType } from './events';

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`;
}

/** Show enough of a secret to identify it, never enough to sign with it. */
export function maskSecret(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export function parseWebhookUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ApiError(400, 'url is required');
  }
  const value = raw.trim();
  if (value.length > 2048) throw new ApiError(400, 'url is too long');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(400, 'url must be a valid absolute URL');
  }
  // Deliveries carry signed tenant data; plaintext transport is not acceptable.
  // http://localhost stays allowed so local development can receive events.
  const isLocal =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
    throw new ApiError(400, 'url must use https');
  }
  return value;
}

export function parseWebhookEvents(raw: unknown): WebhookEventType[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, 'events must be a non-empty array');
  }
  const events: WebhookEventType[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !isWebhookEventType(entry)) {
      throw new ApiError(400, `Unknown event type: ${String(entry)}`);
    }
    if (!events.includes(entry)) events.push(entry);
  }
  return events;
}

export function parseWebhookName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ApiError(400, 'name is required');
  }
  const value = raw.trim();
  if (value.length > 120) throw new ApiError(400, 'name is too long');
  return value;
}
