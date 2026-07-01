import { randomUUID } from 'node:crypto';
import {
  AuditOutcome,
  GranteeType,
  Role,
  SharingScope,
  type DataCategory,
} from '@prisma/client';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';
import { writeAuditEntry } from '@/lib/audit';
import { ApiError, handle } from '@/lib/api';

function requireParishId(parishId: string | null): string {
  if (!parishId) throw new ApiError(400, 'Parish scope required');
  return parishId;
}

function parseDataCategory(input?: string): DataCategory {
  const value = (input ?? '').toUpperCase();
  const allowed = [
    'MEMBER_DIRECTORY',
    'MEMBER_DEMOGRAPHICS_DETAIL',
    'FAMILY_RECORDS',
    'SACRAMENTAL_RECORDS',
    'GIVING_DETAIL',
    'GIVING_STATEMENTS',
    'PROGRAM_ROSTER',
    'FINANCIAL_STATEMENTS',
    'LEDGER_DETAIL',
    'ATTENDANCE_DETAIL',
    'AUDIT_LOG',
    'COMMUNICATIONS_HISTORY',
  ];
  if (!allowed.includes(value)) throw new ApiError(400, 'Invalid dataCategory');
  return value as DataCategory;
}

function parseSharingScope(input?: string): SharingScope {
  if (!input) return SharingScope.ALL_RECORDS;
  const value = input.toUpperCase();
  if (!Object.values(SharingScope).includes(value as SharingScope)) {
    throw new ApiError(400, 'Invalid scope');
  }
  return value as SharingScope;
}

function parseGranteeType(input?: string): GranteeType {
  if (!input) return GranteeType.DIOCESE;
  const value = input.toUpperCase();
  if (!Object.values(GranteeType).includes(value as GranteeType)) {
    throw new ApiError(400, 'Invalid granteeType');
  }
  return value as GranteeType;
}

export const GET = () =>
  handle(async () => {
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
      Role.DIOCESE_ADMIN,
      Role.DIOCESE_STAFF,
      Role.DIOCESE_REPORT_VIEWER,
    ]);
    const claims = await claimsFromUser(actor);

    const grants = await withTenant(claims, (tx) =>
      tx.dataSharingGrant.findMany({
        where: actor.parishId
          ? { parishId: actor.parishId }
          : { dioceseId: actor.dioceseId, granteeId: actor.dioceseId },
        orderBy: [{ grantedAt: 'desc' }],
      }),
    );

    return Response.json({ ok: true, grants });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const requestId = randomUUID();
    const actor = await requireRole([
      Role.PARISH_ADMIN,
      Role.PARISH_DATA_SHARING_MANAGER,
    ]);
    const parishId = requireParishId(actor.parishId);
    const claims = await claimsFromUser(actor);

    const body = (await request.json().catch(() => null)) as
      | {
          dataCategory?: string;
          granteeType?: string;
          granteeId?: string;
          granteeRoleFilter?: Role | null;
          scope?: string;
          scopeDetail?: unknown;
          expiresAt?: string | null;
          notes?: string | null;
        }
      | null;

    if (!body?.dataCategory || !body.granteeId) {
      throw new ApiError(400, 'dataCategory and granteeId are required');
    }

    const granteeType = parseGranteeType(body.granteeType);
    // Only DIOCESE grants are enforced by RLS in this phase (has_active_grant
    // matches granteeType = 'DIOCESE'). Reject PARISH grants rather than
    // persist a record that would silently grant nothing.
    if (granteeType !== GranteeType.DIOCESE) {
      throw new ApiError(400, 'Only DIOCESE grants are supported');
    }
    if (body.granteeId !== actor.dioceseId) {
      throw new ApiError(400, 'granteeId must match actor diocese for DIOCESE grants');
    }

    const grant = await withTenant(claims, (tx) =>
      tx.dataSharingGrant.create({
        data: {
          parishId,
          dioceseId: actor.dioceseId,
          dataCategory: parseDataCategory(body.dataCategory),
          granteeType,
          granteeId: body.granteeId!,
          granteeRoleFilter: body.granteeRoleFilter ?? null,
          scope: parseSharingScope(body.scope),
          scopeDetail: (body.scopeDetail as never) ?? null,
          grantedByUserId: actor.id,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          notes: body.notes?.trim() || null,
        },
      }),
    );

    await writeAuditEntry({
      requestId,
      actorUserId: actor.id,
      actorLabel: actor.email,
      action: 'sharing.grant.create',
      entityType: 'data_sharing_grant',
      entityId: grant.id,
      outcome: AuditOutcome.SUCCESS,
      dioceseId: actor.dioceseId,
      parishId,
      metadata: {
        dataCategory: grant.dataCategory,
        granteeId: grant.granteeId,
      },
    });

    return Response.json({ ok: true, grant });
  });
