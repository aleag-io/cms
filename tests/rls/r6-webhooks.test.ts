/**
 * @rls @r6 @m12
 * Webhook RLS: signing secrets are parish-admin-only, the outbox accepts writes
 * from any tenant actor (emission runs inside staff transactions) but is not
 * readable by them, and the delivery log is never user-writable.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRlsPool, makeClaims, withTenantSession } from '../helpers/rls';
import { FX, resetTestDb, testDb } from '../helpers/db';

const SUB_A = '00000000-0000-0000-0000-0000000e0001';
const EVENT_A = '00000000-0000-0000-0000-0000000e0002';
const DELIVERY_A = '00000000-0000-0000-0000-0000000e0003';

const adminA = makeClaims({
  userId: FX.users.parishAAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_admin',
});
const staffA = makeClaims({
  userId: FX.users.parishAStaff.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishAId,
  role: 'parish_staff',
});
const adminB = makeClaims({
  userId: FX.users.parishBAdmin.id,
  dioceseId: FX.dioceseId,
  parishId: FX.parishBId,
  role: 'parish_admin',
});

async function seed() {
  await testDb.webhookSubscription.create({
    data: {
      id: SUB_A,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      name: 'Parish A receiver',
      url: 'https://example.com/hooks',
      secret: 'whsec_parish_a_secret',
      events: ['member.created'],
      createdByUserId: FX.users.parishAAdmin.id,
      updatedAt: new Date(),
    },
  });
  await testDb.webhookEvent.create({
    data: {
      id: EVENT_A,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      type: 'member.created',
      payload: { memberId: FX.members.aliceSmithId },
    },
  });
  await testDb.webhookDelivery.create({
    data: {
      id: DELIVERY_A,
      dioceseId: FX.dioceseId,
      parishId: FX.parishAId,
      subscriptionId: SUB_A,
      eventId: EVENT_A,
      eventType: 'member.created',
      updatedAt: new Date(),
    },
  });
}

describe('r6 webhook RLS', () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeRlsPool();
  });

  it('parish admin reads its own subscription', async () => {
    const rows = await withTenantSession(adminA, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "WebhookSubscription"`);
      return rows.map((r) => r.id);
    });
    expect(rows).toContain(SUB_A);
  });

  it('parish staff cannot read subscriptions (signing secrets)', async () => {
    const rows = await withTenantSession(staffA, async (c) => {
      const { rows } = await c.query(`SELECT id, secret FROM "WebhookSubscription"`);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('another parish admin cannot see parish A subscriptions', async () => {
    const rows = await withTenantSession(adminB, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "WebhookSubscription"`);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  // Emission runs inside staff-authored transactions, so a plain INSERT must
  // succeed for a role that has no SELECT on the outbox. (A RETURNING clause
  // would be evaluated against the SELECT policy and fail — which is why
  // emitWebhookEvent uses createMany rather than create.)
  it('parish staff can INSERT an outbox event for its own parish', async () => {
    const inserted = await withTenantSession(staffA, async (c) => {
      const { rowCount } = await c.query(
        `INSERT INTO "WebhookEvent" ("id", "dioceseId", "parishId", type, payload)
         VALUES (gen_random_uuid(), $1, $2, 'member.created', '{"memberId":"x"}'::jsonb)`,
        [FX.dioceseId, FX.parishAId],
      );
      return rowCount;
    });
    expect(inserted).toBe(1);
  });

  it('an INSERT with RETURNING is refused for staff (no SELECT on the outbox)', async () => {
    await expect(
      withTenantSession(staffA, async (c) => {
        await c.query(
          `INSERT INTO "WebhookEvent" ("id", "dioceseId", "parishId", type, payload)
           VALUES (gen_random_uuid(), $1, $2, 'member.created', '{}'::jsonb)
           RETURNING id`,
          [FX.dioceseId, FX.parishAId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('parish staff cannot INSERT an outbox event for another parish', async () => {
    await expect(
      withTenantSession(staffA, async (c) => {
        await c.query(
          `INSERT INTO "WebhookEvent" ("id", "dioceseId", "parishId", type, payload)
           VALUES (gen_random_uuid(), $1, $2, 'member.created', '{}'::jsonb)`,
          [FX.dioceseId, FX.parishBId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('parish staff cannot read the outbox', async () => {
    const rows = await withTenantSession(staffA, async (c) => {
      const { rows } = await c.query(`SELECT id FROM "WebhookEvent"`);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('parish admin reads the delivery log; staff and other parishes cannot', async () => {
    const asAdmin = await withTenantSession(adminA, async (c) => {
      const { rows } = await c.query(`SELECT id, status FROM "WebhookDelivery"`);
      return rows;
    });
    expect(asAdmin.map((r) => r.id)).toContain(DELIVERY_A);

    for (const claims of [staffA, adminB]) {
      const rows = await withTenantSession(claims, async (c) => {
        const { rows } = await c.query(`SELECT id FROM "WebhookDelivery"`);
        return rows;
      });
      expect(rows).toHaveLength(0);
    }
  });

  it('users cannot INSERT deliveries — only the privileged worker fans out', async () => {
    await expect(
      withTenantSession(adminA, async (c) => {
        await c.query(
          `INSERT INTO "WebhookDelivery"
             ("id","dioceseId","parishId","subscriptionId","eventId","eventType","updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'member.created', now())`,
          [FX.dioceseId, FX.parishAId, SUB_A, EVENT_A],
        );
      }),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('parish admin may re-queue a delivery (retry)', async () => {
    const updated = await withTenantSession(adminA, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE "WebhookDelivery" SET status = 'PENDING', "nextAttemptAt" = now()
         WHERE id = $1`,
        [DELIVERY_A],
      );
      return rowCount;
    });
    expect(updated).toBe(1);
  });
});
