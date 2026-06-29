/**
 * RLS test helpers.
 *
 * withTenantSession opens a real pg.PoolClient, switches to the
 * app_authenticated role, sets request.jwt.claims, runs fn, then
 * rolls back so the test DB stays clean.
 *
 * This is the authoritative path for RLS tests — it proves that the
 * database policies fire correctly for a given claims set, independent
 * of application code.
 */

import { Pool, type PoolClient } from 'pg';
import type { SessionClaims } from '@/lib/auth';

const rlsPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
});

export async function withTenantSession<T>(
  claims: SessionClaims,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await rlsPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify(claims)],
    );
    const result = await fn(client);
    // Always rollback — RLS tests must not persist data.
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Build a SessionClaims object matching the fixtures in tests/helpers/db.ts. */
export function makeClaims(opts: {
  userId: string;
  dioceseId: string;
  parishId: string | null;
  role: string;
}): SessionClaims {
  return {
    sub: opts.userId,
    app_metadata: {
      diocese_id: opts.dioceseId,
      parish_id: opts.parishId,
      roles: [opts.role],
    },
  };
}

/** Disconnect the RLS pool after all tests complete. */
export async function closeRlsPool() {
  await rlsPool.end();
}
