import { randomUUID } from 'node:crypto';
import {
  ApprovalEntityKind,
  ApprovalMode,
  AuditOutcome,
  Role,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import { resolveOrgLedgerParishId } from '@/lib/finance/resolve-org';
import { centsFromJson, centsToJson } from '@/lib/finance/money';

const ADMIN_ROLES = [
  Role.GLOBAL_ADMIN,
  Role.DIOCESE_ADMIN,
  Role.PARISH_ADMIN,
  Role.ORGANIZATION_LEADER,
] as const;

const ENTITY_KINDS = new Set<ApprovalEntityKind>([
  'JOURNAL',
  'VENDOR_BILL',
  'PAYMENT',
]);
const MODES = new Set<ApprovalMode>([
  'STRICT',
  'THRESHOLD_BASED',
  'HYBRID',
]);

export const GET = (request: Request) =>
  handle(async () => {
    const actor = await requireRole([...ADMIN_ROLES, Role.PARISH_STAFF, Role.DIOCESE_STAFF]);
    const claims = await claimsFromUser(actor);
    const url = new URL(request.url);
    let ledger = parseOwnerQuery(url.searchParams.get('owner'), claims);
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    const policies = await withTenant(claims, (tx) =>
      tx.approvalPolicy.findMany({
        where: {
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
        },
      }),
    );

    return Response.json({
      ok: true,
      ledger,
      policies: policies.map((p) => ({
        ...p,
        thresholdCents:
          p.thresholdCents == null ? null : centsToJson(p.thresholdCents),
      })),
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([...ADMIN_ROLES]);
    const claims = await claimsFromUser(actor);
    const body = (await request.json()) as Record<string, unknown>;
    let ledger = parseOwnerQuery(
      typeof body.owner === 'string' ? body.owner : null,
      claims,
    );
    if (ledger.ownerType === 'ORGANIZATION') {
      ledger = await resolveOrgLedgerParishId(claims, ledger);
    }

    const entityKind = body.entityKind;
    if (
      typeof entityKind !== 'string' ||
      !ENTITY_KINDS.has(entityKind as ApprovalEntityKind)
    ) {
      throw new ApiError(400, 'entityKind must be JOURNAL|VENDOR_BILL|PAYMENT');
    }
    const mode = body.mode;
    if (typeof mode !== 'string' || !MODES.has(mode as ApprovalMode)) {
      throw new ApiError(400, 'mode must be STRICT|THRESHOLD_BASED|HYBRID');
    }

    const thresholdCents =
      body.thresholdCents == null || body.thresholdCents === ''
        ? null
        : centsFromJson(body.thresholdCents as string | number);
    const minApprovals =
      typeof body.minApprovals === 'number' && body.minApprovals >= 1
        ? Math.floor(body.minApprovals)
        : 1;
    const approverRoles = Array.isArray(body.approverRoles)
      ? (body.approverRoles as string[]).filter((r): r is Role =>
          Object.values(Role).includes(r as Role),
        )
      : [Role.PARISH_ADMIN, Role.DIOCESE_ADMIN];
    const sensitiveKinds = Array.isArray(body.sensitiveKinds)
      ? (body.sensitiveKinds as string[]).filter((k): k is ApprovalEntityKind =>
          ENTITY_KINDS.has(k as ApprovalEntityKind),
        )
      : [];

    const row = await withTenant(claims, (tx) =>
      tx.approvalPolicy.upsert({
        where: {
          ownerType_ownerId_entityKind: {
            ownerType: ledger.ownerType,
            ownerId: ledger.ownerId,
            entityKind: entityKind as ApprovalEntityKind,
          },
        },
        create: {
          dioceseId: ledger.dioceseId,
          parishId: ledger.parishId,
          ownerType: ledger.ownerType,
          ownerId: ledger.ownerId,
          entityKind: entityKind as ApprovalEntityKind,
          mode: mode as ApprovalMode,
          thresholdCents,
          minApprovals,
          approverRoles,
          sensitiveKinds,
        },
        update: {
          mode: mode as ApprovalMode,
          thresholdCents,
          minApprovals,
          approverRoles,
          sensitiveKinds,
          isActive: true,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'finance.approval.policy_upsert',
      entityType: 'finance_approval_policy',
      entityId: row.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: ledger.dioceseId,
      parishId: ledger.parishId,
      metadata: { entityKind, mode },
    });

    return Response.json({
      ok: true,
      policy: {
        ...row,
        thresholdCents:
          row.thresholdCents == null
            ? null
            : centsToJson(row.thresholdCents),
      },
    });
  });
