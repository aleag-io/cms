import type { ApprovalEntityKind, ApprovalMode } from '@prisma/client';

export type ApprovalPolicyInput = {
  mode: ApprovalMode;
  thresholdCents: bigint | null;
  minApprovals: number;
  sensitiveKinds: ApprovalEntityKind[];
};

export type ApprovalResolution = {
  requiresApproval: boolean;
  requiredApprovals: number;
  autoApproved: boolean;
};

/**
 * Pure maker-checker routing (PA-23/24).
 * STRICT always requires approval.
 * THRESHOLD_BASED requires approval when amount >= threshold.
 * HYBRID requires approval when amount >= threshold OR entityKind is sensitive.
 */
export function resolveApproval(
  policy: ApprovalPolicyInput,
  amountCents: bigint,
  entityKind: ApprovalEntityKind,
): ApprovalResolution {
  const min = Math.max(1, policy.minApprovals || 1);
  let requires = false;

  switch (policy.mode) {
    case 'STRICT':
      requires = true;
      break;
    case 'THRESHOLD_BASED': {
      const thr = policy.thresholdCents ?? BigInt(0);
      requires = amountCents >= thr;
      break;
    }
    case 'HYBRID': {
      const thr = policy.thresholdCents ?? BigInt(0);
      const sensitive = policy.sensitiveKinds.includes(entityKind);
      requires = amountCents >= thr || sensitive;
      break;
    }
    default:
      requires = true;
  }

  return {
    requiresApproval: requires,
    requiredApprovals: requires ? min : 0,
    autoApproved: !requires,
  };
}
