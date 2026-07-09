/**
 * @phase:4
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { FX, resetTestDb, testDb } from '../../helpers/db';
import { asGuest, asUser } from '../../helpers/auth';
import * as requestsRoute from '@/app/api/sharing/requests/route';
import * as requestRoute from '@/app/api/sharing/requests/[id]/route';
import * as grantsRoute from '@/app/api/sharing/grants/route';
import * as grantRoute from '@/app/api/sharing/grants/[id]/route';
import * as emergencyRoute from '@/app/api/sharing/emergency/route';
import * as emergencyDetailRoute from '@/app/api/sharing/emergency/[id]/route';
import * as expireRequestsRoute from '@/app/api/jobs/expire-sharing-requests/route';
import * as expireEmergencyRoute from '@/app/api/jobs/expire-emergency-access/route';
import * as sharesRoute from '@/app/api/shares/route';
import * as shareRoute from '@/app/api/shares/[id]/route';
import * as shareViewRoute from '@/app/api/shares/[id]/view/route';
import * as secureLinkRoute from '@/app/api/shares/link/[token]/route';

type IdCtx = { params: Promise<{ id: string }> };
const ctx = (id: string): IdCtx => ({ params: Promise.resolve({ id }) });

type TokenCtx = { params: Promise<{ token: string }> };
const tokenCtx = (token: string): TokenCtx => ({
  params: Promise.resolve({ token }),
});

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Phase 4 sharing lifecycle', () => {
  let resetAuth: () => void;

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    resetAuth?.();
  });

  it('lists contextual shares without token hashes', async () => {
    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const create = await sharesRoute.POST(
      jsonReq('http://localhost/api/shares', 'POST', {
        resourceType: 'member_list',
        shareMode: 'SECURE_LINK',
        isAnonymized: true,
        maxViews: 2,
      }),
    );
    expect(create.status).toBe(200);
    const created = await create.json();
    expect(created.secureLinkToken).toBeTruthy();
    expect(created.share.tokenHash).toBeUndefined();

    const list = await sharesRoute.GET();
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.shares.length).toBeGreaterThanOrEqual(1);
    for (const share of listed.shares) {
      expect(share.tokenHash).toBeUndefined();
    }

    const detail = await shareRoute.GET(
      new Request(`http://localhost/api/shares/${created.share.id}`),
      ctx(created.share.id),
    );
    expect(detail.status).toBe(200);
    const detailData = await detail.json();
    expect(detailData.share.tokenHash).toBeUndefined();
  });

  it('atomic view consume enforces maxViews under concurrent access', async () => {
    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const create = await sharesRoute.POST(
      jsonReq('http://localhost/api/shares', 'POST', {
        resourceType: 'member_list',
        shareMode: 'SECURE_LINK',
        isAnonymized: true,
        maxViews: 1,
      }),
    );
    const created = await create.json();
    const token = created.secureLinkToken as string;

    resetAuth = asGuest();
    const [a, b] = await Promise.all([
      secureLinkRoute.GET(
        new Request(`http://localhost/api/shares/link/${token}`),
        tokenCtx(token),
      ),
      secureLinkRoute.GET(
        new Request(`http://localhost/api/shares/link/${token}`),
        tokenCtx(token),
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    // Exactly one success under maxViews=1.
    expect(statuses).toEqual([200, 403]);
  });

  it('request -> approve -> grant issued -> revoke writes audit trail', async () => {
    const dioceseAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(dioceseAdmin);

    const createReq = await requestsRoute.POST(
      jsonReq('http://localhost/api/sharing/requests', 'POST', {
        parishId: FX.parishAId,
        dataCategory: 'MEMBER_DIRECTORY',
        reason: 'Quarterly pastoral reporting',
      }),
    );
    expect(createReq.status).toBe(200);
    const createdData = await createReq.json();

    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const approve = await requestRoute.PATCH(
      jsonReq(
        `http://localhost/api/sharing/requests/${createdData.request.id}`,
        'PATCH',
        { decision: 'APPROVE' },
      ),
      ctx(createdData.request.id),
    );
    expect(approve.status).toBe(200);

    const grants = await grantsRoute.GET();
    const grantsData = await grants.json();
    const grant = grantsData.grants.find(
      (g: { requestId: string | null }) => g.requestId === createdData.request.id,
    );
    expect(grant).toBeTruthy();

    const revoke = await grantRoute.DELETE(
      new Request(`http://localhost/api/sharing/grants/${grant.id}`, {
        method: 'DELETE',
      }),
      ctx(grant.id),
    );
    expect(revoke.status).toBe(200);

    const actions = await testDb.auditEntry.findMany({
      where: {
        action: {
          in: [
            'sharing.request.create',
            'sharing.request.approve',
            'sharing.grant.create',
            'sharing.grant.revoke',
          ],
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const names = actions.map((a) => a.action);
    expect(names).toContain('sharing.request.create');
    expect(names).toContain('sharing.request.approve');
    expect(names).toContain('sharing.grant.create');
    expect(names).toContain('sharing.grant.revoke');
  });

  it('secure links deny when exhausted, expired, or revoked and do not log raw tokens', async () => {
    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const create = await sharesRoute.POST(
      jsonReq('http://localhost/api/shares', 'POST', {
        resourceType: 'member_list',
        shareMode: 'SECURE_LINK',
        isAnonymized: true,
        maxViews: 1,
      }),
    );
    expect(create.status).toBe(200);
    const created = await create.json();

    const token = created.secureLinkToken as string;
    expect(typeof token).toBe('string');

    resetAuth = asGuest();

    const first = await secureLinkRoute.GET(
      new Request(`http://localhost/api/shares/link/${token}`),
      tokenCtx(token),
    );
    expect(first.status).toBe(200);

    const exhausted = await secureLinkRoute.GET(
      new Request(`http://localhost/api/shares/link/${token}`),
      tokenCtx(token),
    );
    expect(exhausted.status).toBe(403);

    resetAuth = asUser(parishAdmin);
    const revoke = await shareRoute.DELETE(
      new Request(`http://localhost/api/shares/${created.share.id}`, {
        method: 'DELETE',
      }),
      ctx(created.share.id),
    );
    expect(revoke.status).toBe(200);

    resetAuth = asGuest();
    const revoked = await secureLinkRoute.GET(
      new Request(`http://localhost/api/shares/link/${token}`),
      tokenCtx(token),
    );
    expect(revoked.status).toBe(403);

    resetAuth = asUser(parishAdmin);
    const expiredCreate = await sharesRoute.POST(
      jsonReq('http://localhost/api/shares', 'POST', {
        resourceType: 'member_list',
        shareMode: 'SECURE_LINK',
        isAnonymized: true,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const expiredData = await expiredCreate.json();

    resetAuth = asGuest();
    const expired = await secureLinkRoute.GET(
      new Request(`http://localhost/api/shares/link/${expiredData.secureLinkToken}`),
      tokenCtx(expiredData.secureLinkToken),
    );
    expect(expired.status).toBe(403);

    const audits = await testDb.auditEntry.findMany({
      where: {
        action: {
          in: ['sharing.share.create', 'sharing.share.view', 'sharing.share.denied'],
        },
      },
    });

    for (const entry of audits) {
      expect(entry.actorLabel.includes(token)).toBe(false);
      expect(JSON.stringify(entry.metadata ?? {}).includes(token)).toBe(false);
    }
  });

  it('role shares are scoped to the share parish', async () => {
    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const create = await sharesRoute.POST(
      jsonReq('http://localhost/api/shares', 'POST', {
        resourceType: 'member_list',
        shareMode: 'ROLE_SHARE',
        recipientRole: 'PARISH_STAFF',
      }),
    );
    expect(create.status).toBe(200);
    const created = await create.json();

    const parishBStaff = await testDb.appUser.create({
      data: {
        email: 'parish-b-staff@test.local',
        displayName: 'Parish B Staff',
        role: Role.PARISH_STAFF,
        dioceseId: FX.dioceseId,
        parishId: FX.parishBId,
      },
    });
    resetAuth = asUser(parishBStaff);

    const view = await shareViewRoute.GET(
      new Request(`http://localhost/api/shares/${created.share.id}/view`),
      ctx(created.share.id),
    );
    expect(view.status).toBe(404);
  });

  it('diocese users cannot request or create emergency access for another diocese parish', async () => {
    const otherDiocese = await testDb.diocese.create({
      data: { name: 'Other Diocese' },
    });
    const otherParish = await testDb.parish.create({
      data: {
        name: 'Other Parish',
        dioceseId: otherDiocese.id,
      },
    });

    const dioceseAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(dioceseAdmin);

    const request = await requestsRoute.POST(
      jsonReq('http://localhost/api/sharing/requests', 'POST', {
        parishId: otherParish.id,
        dataCategory: 'MEMBER_DIRECTORY',
        reason: 'Cross-diocese request should be denied',
      }),
    );
    expect(request.status).toBe(404);

    const emergency = await emergencyRoute.POST(
      jsonReq('http://localhost/api/sharing/emergency', 'POST', {
        parishId: otherParish.id,
        justification: 'Cross-diocese emergency should be denied',
        durationDays: 1,
      }),
    );
    expect(emergency.status).toBe(404);
  });

  it('reject path writes sharing.request.reject and issues no grant', async () => {
    const dioceseAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(dioceseAdmin);

    const createReq = await requestsRoute.POST(
      jsonReq('http://localhost/api/sharing/requests', 'POST', {
        parishId: FX.parishAId,
        dataCategory: 'MEMBER_DIRECTORY',
        reason: 'Request to be rejected',
      }),
    );
    const createdData = await createReq.json();

    const parishAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.parishAAdmin.id },
    });
    resetAuth = asUser(parishAdmin);

    const reject = await requestRoute.PATCH(
      jsonReq(
        `http://localhost/api/sharing/requests/${createdData.request.id}`,
        'PATCH',
        { decision: 'REJECT' },
      ),
      ctx(createdData.request.id),
    );
    expect(reject.status).toBe(200);
    const rejected = await reject.json();
    expect(rejected.request.status).toBe('REJECTED');

    const grantCount = await testDb.dataSharingGrant.count({
      where: { requestId: createdData.request.id },
    });
    expect(grantCount).toBe(0);

    const rejectAudit = await testDb.auditEntry.findMany({
      where: { action: 'sharing.request.reject' },
    });
    expect(rejectAudit.length).toBeGreaterThan(0);
  });

  it('emergency access create and revoke write audit entries', async () => {
    const dioceseAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(dioceseAdmin);

    const create = await emergencyRoute.POST(
      jsonReq('http://localhost/api/sharing/emergency', 'POST', {
        parishId: FX.parishAId,
        justification: 'Urgent pastoral situation',
        durationDays: 3,
      }),
    );
    expect(create.status).toBe(200);
    const created = await create.json();

    const revoke = await emergencyDetailRoute.DELETE(
      new Request(`http://localhost/api/sharing/emergency/${created.grant.id}`, {
        method: 'DELETE',
      }),
      ctx(created.grant.id),
    );
    expect(revoke.status).toBe(200);

    const actions = (
      await testDb.auditEntry.findMany({
        where: {
          action: { in: ['sharing.emergency.create', 'sharing.emergency.revoke'] },
        },
      })
    ).map((a) => a.action);
    expect(actions).toContain('sharing.emergency.create');
    expect(actions).toContain('sharing.emergency.revoke');
  });

  it('emergency durationDays is capped at 7 and non-numeric input is rejected', async () => {
    const dioceseAdmin = await testDb.appUser.findUniqueOrThrow({
      where: { id: FX.users.dioceseAdmin.id },
    });
    resetAuth = asUser(dioceseAdmin);

    const capped = await emergencyRoute.POST(
      jsonReq('http://localhost/api/sharing/emergency', 'POST', {
        parishId: FX.parishAId,
        justification: 'Requested 30 days but must cap at 7',
        durationDays: 30,
      }),
    );
    expect(capped.status).toBe(200);
    const cappedData = await capped.json();
    const days =
      (new Date(cappedData.grant.expiresAt).getTime() - Date.now()) /
      (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(7.01);
    expect(days).toBeGreaterThan(6.5);

    const invalid = await emergencyRoute.POST(
      jsonReq('http://localhost/api/sharing/emergency', 'POST', {
        parishId: FX.parishAId,
        justification: 'Non-numeric duration',
        durationDays: 'soon',
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it('cron jobs expire stale requests and emergency grants with audit entries', async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    try {
      const staleRequest = await testDb.dataSharingRequest.create({
        data: {
          parishId: FX.parishAId,
          dioceseId: FX.dioceseId,
          dataCategory: 'MEMBER_DIRECTORY',
          reason: 'stale pending request',
          requestedByUserId: FX.users.dioceseAdmin.id,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const expireReq = await expireRequestsRoute.POST(
        new Request('http://localhost/api/jobs/expire-sharing-requests', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        }),
      );
      expect(expireReq.status).toBe(200);
      const refreshedReq = await testDb.dataSharingRequest.findUniqueOrThrow({
        where: { id: staleRequest.id },
      });
      expect(refreshedReq.status).toBe('EXPIRED');

      const staleEmergency = await testDb.emergencyAccessGrant.create({
        data: {
          parishId: FX.parishAId,
          dioceseId: FX.dioceseId,
          grantedByUserId: FX.users.dioceseAdmin.id,
          justification: 'stale emergency grant',
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const expireEmg = await expireEmergencyRoute.POST(
        new Request('http://localhost/api/jobs/expire-emergency-access', {
          method: 'POST',
          headers: { 'x-cron-secret': 'test-cron-secret' },
        }),
      );
      expect(expireEmg.status).toBe(200);
      const refreshedEmg = await testDb.emergencyAccessGrant.findUniqueOrThrow({
        where: { id: staleEmergency.id },
      });
      expect(refreshedEmg.isActive).toBe(false);

      const actions = (
        await testDb.auditEntry.findMany({
          where: {
            action: {
              in: ['sharing.request.expire', 'sharing.emergency.expire'],
            },
          },
        })
      ).map((a) => a.action);
      expect(actions).toContain('sharing.request.expire');
      expect(actions).toContain('sharing.emergency.expire');
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });
});
