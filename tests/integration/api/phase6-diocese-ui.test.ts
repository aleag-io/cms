/**
 * @phase:6
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditOutcome, Role } from '@prisma/client';
import { FX, resetTestDb, testDb } from '../../helpers/db';
import { asUser } from '../../helpers/auth';
import * as auditRoute from '@/app/api/audit/route';
import * as parishRoute from '@/app/api/parishes/route';
import * as parishDetailRoute from '@/app/api/parishes/[id]/route';
import * as dioceseUsersRoute from '@/app/api/dioceses/users/route';
import * as dioceseUserDetailRoute from '@/app/api/dioceses/users/[id]/route';

describe('Phase 6 diocese UI APIs', () => {
  let resetAuth: (() => void) | undefined;

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    resetAuth?.();
    resetAuth = undefined;
  });

  it('creates a parish and audits the lifecycle action', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const response = await parishRoute.POST(
      new Request('http://localhost/api/parishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parishName: 'St. Peter Mar Thoma Parish',
          address: 'Chicago, IL',
          adminEmail: 'peter-admin@test.local',
          adminName: 'Peter Admin',
          familyNumberPrefix: 'CHI-',
          familyNumberWidth: 5,
          familyNumberStart: 10,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.parish.name).toBe('St. Peter Mar Thoma Parish');
    expect(body.admin.role).toBe(Role.PARISH_ADMIN);

    const auditRow = await testDb.auditEntry.findFirstOrThrow({
      where: {
        action: 'tenant.parish.create',
        entityId: body.parish.id,
      },
    });
    expect(auditRow.outcome).toBe(AuditOutcome.SUCCESS);
    expect(auditRow.metadata).toMatchObject({
      parishName: 'St. Peter Mar Thoma Parish',
      adminEmail: 'peter-admin@test.local',
    });
  });

  it('deactivates a parish and records the audited update', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const response = await parishDetailRoute.PATCH(
      new Request(`http://localhost/api/parishes/${FX.parishBId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: FX.parishBId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.parish.isActive).toBe(false);

    const parish = await testDb.parish.findUniqueOrThrow({
      where: { id: FX.parishBId },
    });
    expect(parish.isActive).toBe(false);

    const auditRow = await testDb.auditEntry.findFirstOrThrow({
      where: {
        action: 'tenant.parish.update',
        entityId: FX.parishBId,
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(auditRow.outcome).toBe(AuditOutcome.SUCCESS);
    expect(auditRow.metadata).toMatchObject({
      changes: ['isActive'],
    });
  });

  it('assigns and updates diocese-managed roles with audit rows', async () => {
    const admin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(admin);

    const createResponse = await dioceseUsersRoute.POST(
      new Request('http://localhost/api/dioceses/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'viewer@test.local',
          displayName: 'Viewer User',
          role: 'PARISH_ADMIN',
          parishId: FX.parishAId,
          isActive: true,
        }),
      }),
    );

    expect(createResponse.status).toBe(200);
    const createBody = await createResponse.json();
    expect(createBody.user.role).toBe(Role.PARISH_ADMIN);
    expect(createBody.user.parishId).toBe(FX.parishAId);

    const updateResponse = await dioceseUserDetailRoute.PATCH(
      new Request(`http://localhost/api/dioceses/users/${createBody.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Viewer User Updated',
          role: 'DIOCESE_REPORT_VIEWER',
          parishId: null,
          isActive: false,
        }),
      }),
      { params: Promise.resolve({ id: createBody.user.id }) },
    );

    expect(updateResponse.status).toBe(200);
    const updateBody = await updateResponse.json();
    expect(updateBody.user.role).toBe(Role.DIOCESE_REPORT_VIEWER);
    expect(updateBody.user.parishId).toBeNull();
    expect(updateBody.user.isActive).toBe(false);

    const auditRows = await testDb.auditEntry.findMany({
      where: {
        action: 'access.role.assign',
        entityId: createBody.user.id,
      },
      orderBy: { timestamp: 'asc' },
    });
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0].metadata).toMatchObject({
      after: { role: 'PARISH_ADMIN', parishId: FX.parishAId, isActive: true },
    });
    expect(auditRows[1].metadata).toMatchObject({
      after: {
        role: 'DIOCESE_REPORT_VIEWER',
        parishId: null,
        isActive: false,
      },
    });
  });

  it('allows diocese staff to read diocese-scope audit entries', async () => {
    const staff = await testDb.appUser.create({
      data: {
        email: 'diocese-staff@test.local',
        displayName: 'Diocese Staff',
        role: Role.DIOCESE_STAFF,
        dioceseId: FX.dioceseId,
        parishId: null,
      },
    });
    resetAuth = asUser(staff);

    await testDb.auditEntry.create({
      data: {
        requestId: 'phase6-audit-read',
        actorType: 'HUMAN',
        actorUserId: FX.users.dioceseAdmin.id,
        actorLabel: 'diocese-admin@test.local',
        action: 'tenant.diocese.update',
        entityType: 'diocese',
        outcome: AuditOutcome.SUCCESS,
        dioceseId: FX.dioceseId,
        parishId: null,
      },
    });

    const response = await auditRoute.GET(
      new Request('http://localhost/api/audit?limit=10&page=1'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.auditEntries.length).toBeGreaterThan(0);
    expect(body.auditEntries.every((entry: { parishId: string | null }) => entry.parishId === null)).toBe(true);
  });
});