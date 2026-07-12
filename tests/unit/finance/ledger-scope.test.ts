import { describe, expect, it } from 'vitest';
import { parseOwnerQuery } from '@/lib/finance/ledger-scope';
import type { SessionClaims } from '@/lib/auth';

const dioceseClaims: SessionClaims = {
  sub: 'u1',
  app_metadata: {
    diocese_id: '00000000-0000-0000-0000-000000000001',
    parish_id: null,
    working_parish_id: null,
    roles: ['diocese_admin'],
    member_id: null,
    clergy_parish_ids: [],
    program_leader_ids: [],
    org_leader_ids: [],
  },
};

const parishClaims: SessionClaims = {
  ...dioceseClaims,
  app_metadata: {
    ...dioceseClaims.app_metadata,
    parish_id: '00000000-0000-0000-0000-000000000010',
    roles: ['parish_admin'],
  },
};

describe('parseOwnerQuery multi-level', () => {
  it('defaults diocese users to DIOCESE ledger', () => {
    const ref = parseOwnerQuery(null, dioceseClaims);
    expect(ref.ownerType).toBe('DIOCESE');
    expect(ref.ownerId).toBe(dioceseClaims.app_metadata.diocese_id);
    expect(ref.parishId).toBeNull();
  });

  it('defaults parish users to PARISH ledger', () => {
    const ref = parseOwnerQuery(null, parishClaims);
    expect(ref.ownerType).toBe('PARISH');
    expect(ref.ownerId).toBe(parishClaims.app_metadata.parish_id);
  });

  it('parses org owner', () => {
    const orgId = '00000000-0000-0000-0000-000000000099';
    const ref = parseOwnerQuery(`org:${orgId}`, parishClaims);
    expect(ref.ownerType).toBe('ORGANIZATION');
    expect(ref.ownerId).toBe(orgId);
  });

  it('allows explicit diocese owner from diocese session', () => {
    const ref = parseOwnerQuery('diocese', dioceseClaims);
    expect(ref.ownerType).toBe('DIOCESE');
  });
});
