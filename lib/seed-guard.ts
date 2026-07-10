/**
 * Safety checks for destructive demo seed (TRUNCATE).
 * Used by prisma/seed.ts and unit-tested in isolation.
 */

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function parseDbHost(connectionUrl: string): string {
  try {
    return new URL(connectionUrl).hostname;
  } catch {
    // Fallback for unusual connection strings
    const m = connectionUrl.match(/@([^/?]+)/);
    return m?.[1]?.split(':')[0] ?? '';
  }
}

/**
 * Refuse destructive seed against shared/prod DBs unless explicitly opted in.
 */
export function assertSeedTargetSafe(
  connectionUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const dbHost = parseDbHost(connectionUrl);
  if (!dbHost) {
    throw new Error(
      'Could not parse database host from connection string — refusing to seed.',
    );
  }

  const isLocalDb = LOCAL_DB_HOSTS.has(dbHost);
  const remoteAllowed =
    env.SEED_ALLOW_REMOTE === '1' || env.ALLOW_DEMO_SEED === '1';

  if (!isLocalDb && !remoteAllowed) {
    throw new Error(
      `Refusing to seed non-local database host "${dbHost}" — this script TRUNCATEs all tenant data. ` +
        'Use a local Supabase DATABASE_URL, or set SEED_ALLOW_REMOTE=1 (or ALLOW_DEMO_SEED=1) ' +
        'only if you really mean to reseed a remote database.',
    );
  }
}
