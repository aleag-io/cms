/**
 * Apply one or more .sql files (or directories of them) to Postgres.
 *
 * Connection: DATABASE_URL → POSTGRES_URL_NON_POOLING → POSTGRES_URL
 *
 * Local Supabase: if a `supabase_db_*` Docker container is running, applies
 * as `supabase_admin` via docker/psql (needed for ownership of functions).
 * Override with APPLY_SQL_USE_DOCKER=0 to force the pg client.
 *
 * Tracking: records each basename in `_app_sql_migrations` and skips
 * already-applied files unless APPLY_SQL_FORCE=1.
 *
 * SQL should still be written idempotently (DROP POLICY IF EXISTS, etc.).
 */
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const { resolveDatabaseUrl } = require('./resolve-database-url');

function expand(arg) {
  if (fs.statSync(arg).isDirectory()) {
    return fs
      .readdirSync(arg)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => path.join(arg, f));
  }
  return [arg];
}

const files = process.argv.slice(2).flatMap(expand);
const url = resolveDatabaseUrl();
const force = process.env.APPLY_SQL_FORCE === '1';
const forcePg = process.env.APPLY_SQL_USE_DOCKER === '0';

if (!url) {
  console.error(
    'FAILED: No database URL. Set DATABASE_URL or POSTGRES_URL_NON_POOLING ' +
      '(or add them to .env.local).',
  );
  process.exit(1);
}

if (files.length === 0) {
  console.error('FAILED: pass one or more .sql files or directories');
  process.exit(1);
}

function migrationId(filePath) {
  return path.basename(filePath);
}

function clientConfig(connectionString) {
  let clean = connectionString;
  try {
    const u = new URL(connectionString);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('sslrootcert');
    clean = u.toString();
  } catch {
    // keep original
  }
  const remote =
    /supabase\.(co|com)|pooler\.supabase/i.test(clean) ||
    process.env.PGSSL === '1' ||
    process.env.DATABASE_SSL === '1';
  return {
    connectionString: clean,
    ...(remote ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function findLocalSupabaseDbContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return (
    result.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((name) => name.startsWith('supabase_db_')) ?? null
  );
}

async function withClient(fn) {
  const client = new Client(clientConfig(url));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_app_sql_migrations" (
      "id" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(client, id) {
  const { rows } = await client.query(
    `SELECT 1 FROM "_app_sql_migrations" WHERE "id" = $1`,
    [id],
  );
  return rows.length > 0;
}

async function markApplied(client, id) {
  await client.query(
    `INSERT INTO "_app_sql_migrations" ("id") VALUES ($1)
     ON CONFLICT ("id") DO NOTHING`,
    [id],
  );
}

function applyViaDocker(filePath, containerName) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGPASSWORD=postgres',
      containerName,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
    ],
    { input: sql, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql apply failed');
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
}

async function applyViaPg(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}

async function run() {
  const containerName = forcePg ? null : findLocalSupabaseDbContainer();
  const mode = containerName
    ? `docker/psql as supabase_admin (${containerName})`
    : 'pg client';

  console.log(
    `Applying ${files.length} SQL file(s) via ${mode} (force=${force ? 'yes' : 'no'})…`,
  );

  // Ledger always via app connection (postgres / pooler role).
  await withClient(async (client) => {
    await ensureLedger(client);
  });

  for (const f of files) {
    const id = migrationId(f);

    const already = await withClient((client) => isApplied(client, id));
    if (!force && already) {
      console.log(`=== Skip ${f} (already applied: ${id}) ===`);
      continue;
    }

    console.log(`=== Applying ${f} ===`);
    try {
      if (containerName) {
        applyViaDocker(f, containerName);
      } else {
        await applyViaPg(f);
      }
      await withClient((client) => markApplied(client, id));
      console.log('OK');
    } catch (e) {
      console.error('FAILED:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
}

run();
