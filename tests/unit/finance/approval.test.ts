import { describe, expect, it } from 'vitest';
import { resolveApproval } from '@/lib/finance/approval';

describe('resolveApproval', () => {
  it('STRICT always requires approval', () => {
    const r = resolveApproval(
      {
        mode: 'STRICT',
        thresholdCents: BigInt(10000),
        minApprovals: 2,
        sensitiveKinds: [],
      },
      BigInt(1),
      'JOURNAL',
    );
    expect(r.requiresApproval).toBe(true);
    expect(r.requiredApprovals).toBe(2);
    expect(r.autoApproved).toBe(false);
  });

  it('THRESHOLD_BASED routes by amount', () => {
    const policy = {
      mode: 'THRESHOLD_BASED' as const,
      thresholdCents: BigInt(1000),
      minApprovals: 1,
      sensitiveKinds: [],
    };
    expect(resolveApproval(policy, BigInt(999), 'JOURNAL').autoApproved).toBe(true);
    expect(resolveApproval(policy, BigInt(1000), 'JOURNAL').requiresApproval).toBe(
      true,
    );
  });

  it('HYBRID uses threshold or sensitive kinds', () => {
    const policy = {
      mode: 'HYBRID' as const,
      thresholdCents: BigInt(50000),
      minApprovals: 1,
      sensitiveKinds: ['PAYMENT' as const],
    };
    expect(resolveApproval(policy, BigInt(100), 'JOURNAL').autoApproved).toBe(true);
    expect(resolveApproval(policy, BigInt(100), 'PAYMENT').requiresApproval).toBe(
      true,
    );
    expect(resolveApproval(policy, BigInt(50000), 'JOURNAL').requiresApproval).toBe(
      true,
    );
  });
});
