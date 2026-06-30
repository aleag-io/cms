import { MessageChannel } from '@prisma/client';

/**
 * Communication provider seam (PA-8).
 *
 * Production wires Resend (email) / Twilio (SMS). Locally and in CI the
 * provider is mocked via setCommProvider() so the worker can be exercised
 * end-to-end without network calls. The default provider is a no-network stub
 * that returns a deterministic provider message id — it must be replaced with
 * real credentials before production sends.
 */

export interface SendResult {
  providerMessageId: string;
}

export interface CommProvider {
  send(
    channel: MessageChannel,
    destination: string,
    payload: { subject?: string | null; body: string },
  ): Promise<SendResult>;
}

const stubProvider: CommProvider = {
  async send(channel, destination) {
    return {
      providerMessageId: `stub-${channel.toLowerCase()}-${destination}-${Date.now()}`,
    };
  },
};

let _provider: CommProvider = stubProvider;

export function setCommProvider(provider: CommProvider): () => void {
  const previous = _provider;
  _provider = provider;
  return () => {
    _provider = previous;
  };
}

export function getCommProvider(): CommProvider {
  return _provider;
}
