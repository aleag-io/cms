import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role, ShareMode } from '@prisma/client';
import { claimsFromUser, requireSessionUser } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { generateToken } from '@/lib/sharing/tokens';

function ensureCanCreateShare(roles: Role[]) {
  const allowed = new Set<Role>([
    Role.PARISH_ADMIN,
    Role.PARISH_STAFF,
    Role.PARISH_DATA_SHARING_MANAGER,
    Role.CLERGY,
    Role.ORGANIZATION_LEADER,
    Role.MINISTRY_LEADER,
  ]);
  if (!roles.some((r) => allowed.has(r))) {
    throw new ApiError(403, 'Forbidden');
  }
}

function canManageShares(role: Role): boolean {
  return role === Role.PARISH_ADMIN || role === Role.PARISH_DATA_SHARING_MANAGER;
}

/** Strip token hashes — raw tokens are only returned once at create time. */
function publicShare<T extends Record<string, unknown>>(share: T) {
  const rest = { ...share };
  delete rest.tokenHash;
  return rest;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireSessionUser();
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    ensureCanCreateShare([actor.role]);
    const claims = await claimsFromUser(actor);

    const shares = await withTenant(claims, (tx) =>
      tx.contextualShare.findMany({
        where: canManageShares(actor.role)
          ? { parishId: actor.parishId! }
          : { parishId: actor.parishId!, createdByUserId: actor.id },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
    );

    return Response.json({
      ok: true,
      shares: shares.map((s) => publicShare(s)),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireSessionUser();
    if (!actor.parishId) throw new ApiError(400, 'Parish scope required');
    ensureCanCreateShare([actor.role]);
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => null)) as
      | {
          resourceType?: string;
          resourceId?: string | null;
          shareMode?: string;
          recipientUserId?: string | null;
          recipientRole?: Role | null;
          isAnonymized?: boolean;
          expiresAt?: string | null;
          maxViews?: number | null;
        }
      | null;

    if (!body?.resourceType || !body.shareMode) {
      throw new ApiError(400, 'resourceType and shareMode are required');
    }

    const mode = body.shareMode.toUpperCase();
    if (!Object.values(ShareMode).includes(mode as ShareMode)) {
      throw new ApiError(400, 'Invalid shareMode');
    }

    if (mode === ShareMode.USER_SHARE && !body.recipientUserId) {
      throw new ApiError(400, 'recipientUserId is required for USER_SHARE');
    }
    if (mode === ShareMode.ROLE_SHARE && !body.recipientRole) {
      throw new ApiError(400, 'recipientRole is required for ROLE_SHARE');
    }

    const token = mode === ShareMode.SECURE_LINK ? generateToken() : null;

    const share = await withTenant(claims, (tx) =>
      tx.contextualShare.create({
        data: {
          parishId: actor.parishId!,
          dioceseId: actor.dioceseId,
          resourceType: body.resourceType!,
          resourceId: body.resourceId ?? null,
          shareMode: mode as ShareMode,
          createdByUserId: actor.id,
          recipientUserId: body.recipientUserId ?? null,
          recipientRole: body.recipientRole ?? null,
          tokenHash: token?.hash,
          isAnonymized: body.isAnonymized ?? false,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          maxViews:
            mode === ShareMode.SECURE_LINK && body.maxViews
              ? Math.max(1, Math.floor(body.maxViews))
              : null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.share.create',
      entityType: 'contextual_share',
      entityId: share.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId: actor.parishId,
      metadata: {
        shareMode: share.shareMode,
        resourceType: share.resourceType,
      },
    });

    return Response.json({
      ok: true,
      share: publicShare(share),
      // One-time raw token for SECURE_LINK — never stored or re-fetched.
      secureLinkToken: token?.raw ?? null,
    });
  });
