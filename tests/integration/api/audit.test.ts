/**
 * @phase:3
 *
 * Audit log route coverage for role gating and pagination. Audit reads use the
 * privileged Prisma client by design, so the route must enforce the role
 * boundary explicitly.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditOutcome } from '@prisma/client';
import { resetTestDb, testDb, FX } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import * as auditRoute from '@/app/api/audit/route';

function req(path: string) {
  return new Request(`http://localhost${path}`);
}

describe('GET /api/audit', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('rejects ordinary parish members', async () => {
    const member = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAMember.id },
    });
    resetAuth = asUser(member);

    const res = await auditRoute.GET(req('/api/audit'));
    expect(res.status).toBe(403);
  });

  it('returns paginated parish audit rows to parish admins', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(admin);

    await testDb.auditEntry.createMany({
      data: Array.from({ length: 3 }, (_, index) => ({
        requestId: `audit-page-${index}`,
        actorType: 'HUMAN',
        actorUserId: admin.id,
        actorLabel: admin.email,
        action: `audit.test.${index}`,
        entityType: 'test',
        outcome: AuditOutcome.SUCCESS,
        dioceseId: FX.dioceseId,
        parishId: FX.parishAId,
      })),
    });

    const res = await auditRoute.GET(req('/api/audit?limit=2&page=1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.auditEntries).toHaveLength(2);
    expect(data.pagination).toEqual({ page: 1, limit: 2, nextPage: 2 });
  });
});
