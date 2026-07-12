import { describe, expect, it } from 'vitest';
import {
  ownerQueryString,
  parseOwnerQuery,
  type LedgerRef,
} from '@/lib/finance/ledger-scope';
import type { SessionClaims } from '@/lib/auth';
import { ApiError } from '@/lib/api';

const dioceseId = '00000000-0000-0000-0000-000000000001';
const parishId = '00000000-0000-0000-0000-000000000010';
const orgId = '00000000-0000-0000-0000-000000000099';

const parishClaims: SessionClaims = {
  sub: 'u',
  app_metadata: {
    diocese_id: dioceseId,
    parish_id: parishId,
    working_parish_id: null,
    roles: ['parish_admin'],
    member_id: null,
    clergy_parish_ids: [],
    program_leader_ids: [],
    org_leader_ids: [],
  },
};

const dioceseClaims: SessionClaims = {
  ...parishClaims,
  app_metadata: {
    ...parishClaims.app_metadata,
    parish_id: null,
    roles: ['diocese_admin'],
  },
};

describe('ownerQueryString / parseOwnerQuery round-trip', () => {
  it('round-trips diocese and parish', () => {
    const d: LedgerRef = {
      ownerType: 'DIOCESE',
      ownerId: dioceseId,
      dioceseId,
      parishId: null,
    };
    expect(ownerQueryString(d)).toBe('diocese');
    expect(parseOwnerQuery(ownerQueryString(d), dioceseClaims)).toMatchObject({
      ownerType: 'DIOCESE',
      ownerId: dioceseId,
    });

    const p: LedgerRef = {
      ownerType: 'PARISH',
      ownerId: parishId,
      dioceseId,
      parishId,
    };
    expect(ownerQueryString(p)).toBe('parish');
    expect(parseOwnerQuery(ownerQueryString(p), parishClaims)).toMatchObject({
      ownerType: 'PARISH',
      ownerId: parishId,
    });
  });

  it('round-trips org owner', () => {
    const o: LedgerRef = {
      ownerType: 'ORGANIZATION',
      ownerId: orgId,
      dioceseId,
      parishId,
    };
    expect(ownerQueryString(o)).toBe(`org:${orgId}`);
    expect(parseOwnerQuery(ownerQueryString(o), parishClaims).ownerId).toBe(
      orgId,
    );
  });

  it('rejects invalid owner forms', () => {
    expect(() => parseOwnerQuery('banana', parishClaims)).toThrow(ApiError);
    expect(() => parseOwnerQuery('org:not-uuid', parishClaims)).toThrow(
      ApiError,
    );
    expect(() => parseOwnerQuery('parish', dioceseClaims)).toThrow(
      /Parish owner/,
    );
  });
});
