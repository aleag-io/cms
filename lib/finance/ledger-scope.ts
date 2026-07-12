/**
 * Multi-level ledger ownership resolution.
 *
 * Four operational scopes:
 *   DIOCESE       — diocese general books (ownerId = dioceseId, parishId null)
 *   PARISH        — church general books (ownerId = parishId)
 *   ORGANIZATION  — org books; diocese-org when org.parishId is null,
 *                   parish-org when org.parishId is set
 */

import type { LedgerOwnerType } from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { SessionClaims } from '@/lib/auth';

export type LedgerRef = {
  ownerType: LedgerOwnerType;
  ownerId: string;
  dioceseId: string;
  parishId: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse ?owner= query for finance APIs/UI.
 * Forms:
 *   owner=diocese
 *   owner=parish
 *   owner=parish:<parishId>   (diocese user working in a parish — rare)
 *   owner=org:<organizationId>
 */
export function parseOwnerQuery(
  raw: string | null | undefined,
  claims: SessionClaims,
): LedgerRef {
  const dioceseId = claims.app_metadata.diocese_id;
  if (!dioceseId) throw new ApiError(400, 'Diocese scope required');

  const parishId = claims.app_metadata.parish_id;
  const value = (raw ?? '').trim().toLowerCase();

  if (!value || value === 'default') {
    // Parish users default to parish ledger; diocese users to diocese ledger
    if (parishId) {
      return {
        ownerType: 'PARISH',
        ownerId: parishId,
        dioceseId,
        parishId,
      };
    }
    return {
      ownerType: 'DIOCESE',
      ownerId: dioceseId,
      dioceseId,
      parishId: null,
    };
  }

  if (value === 'diocese') {
    return {
      ownerType: 'DIOCESE',
      ownerId: dioceseId,
      dioceseId,
      parishId: null,
    };
  }

  if (value === 'parish') {
    if (!parishId) {
      throw new ApiError(400, 'Parish owner requires a parish-scoped session');
    }
    return {
      ownerType: 'PARISH',
      ownerId: parishId,
      dioceseId,
      parishId,
    };
  }

  if (value.startsWith('parish:')) {
    const id = value.slice('parish:'.length);
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid parish owner id');
    return {
      ownerType: 'PARISH',
      ownerId: id,
      dioceseId,
      parishId: id,
    };
  }

  if (value.startsWith('org:')) {
    const id = value.slice('org:'.length);
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid organization owner id');
    // parishId filled by caller after loading Organization (see resolveOrgLedger)
    return {
      ownerType: 'ORGANIZATION',
      ownerId: id,
      dioceseId,
      parishId: null, // placeholder — resolveOrgLedger sets real parishId
    };
  }

  throw new ApiError(
    400,
    'owner must be diocese | parish | parish:<id> | org:<id>',
  );
}

export function ownerQueryString(ref: LedgerRef): string {
  switch (ref.ownerType) {
    case 'DIOCESE':
      return 'diocese';
    case 'PARISH':
      return ref.parishId && ref.parishId !== ref.ownerId
        ? `parish:${ref.ownerId}`
        : 'parish';
    case 'ORGANIZATION':
      return `org:${ref.ownerId}`;
    default:
      return 'default';
  }
}
