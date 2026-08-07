/**
 * Safety checks for destructive demo seed (TRUNCATE).
 * Used by prisma/seed.ts and unit-tested in isolation.
 */

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Production Supabase project ref — never allow destructive seed against this host. */
export const PROD_SUPABASE_PROJECT_REF = 'nehywddvywocalnhuqig';

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
 * True when the connection string points at the known production project.
 * Matches `db.<ref>.supabase.co` and bare ref substrings in the host.
 */
export function isProductionDbTarget(connectionUrl: string): boolean {
  const host = parseDbHost(connectionUrl).toLowerCase();
  if (!host) return false;
  if (host.includes(PROD_SUPABASE_PROJECT_REF)) return true;
  // Direct pooler hosts sometimes look like aws-0-….pooler.supabase.com with
  // the project ref in the username; also check the full URL string.
  return connectionUrl.toLowerCase().includes(PROD_SUPABASE_PROJECT_REF);
}

/**
 * Refuse destructive seed against shared/prod DBs unless explicitly opted in.
 * Production project ref is always refused, even with SEED_ALLOW_REMOTE=1.
 */
export function assertSeedTargetSafe(
  connectionUrl: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (isProductionDbTarget(connectionUrl)) {
    throw new Error(
      `Refusing to seed production database (project ref ${PROD_SUPABASE_PROJECT_REF}). ` +
        'Demo seed is only for local Supabase or the disposable preview branch.',
    );
  }

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
        'only if you really mean to reseed a remote database (never production).',
    );
  }
}

/** Human-readable host for seed banners (no credentials). */
export function describeSeedTarget(connectionUrl: string): string {
  return parseDbHost(connectionUrl) || '(unknown host)';
}
