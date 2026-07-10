/**
 * Apply the full DB migration stack to the configured database:
 *   1. prisma migrate deploy  (schema)
 *   2. supabase/migrations/*  (RLS, grants, hooks) via apply-sql.js
 *
 * Used by:
 *   - Local:  npm run db:migrate:all   (DATABASE_URL → local Supabase)
 *   - Vercel: npm run build            (POSTGRES_URL_NON_POOLING / DATABASE_URL)
 *
 * On Vercel preview deployments, skips migrations unless MIGRATE_ON_PREVIEW=1
 * so accidental preview builds do not thrash a shared DB unless you opt in.
 * Production always migrates.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { resolveDatabaseUrl, loadEnvLocal } = require('./resolve-database-url');

loadEnvLocal();

const url = resolveDatabaseUrl();
if (!url) {
  console.error(
    'db-migrate-all: no DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL',
  );
  process.exit(1);
}

// Ensure child processes (prisma, apply-sql) see a concrete URL.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = url;
}

const onVercel = process.env.VERCEL === '1';
const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
const migrateOnPreview = process.env.MIGRATE_ON_PREVIEW === '1';

if (onVercel && vercelEnv === 'preview' && !migrateOnPreview) {
  console.log(
    'db-migrate-all: skipping on Vercel preview (set MIGRATE_ON_PREVIEW=1 to enable).',
  );
  process.exit(0);
}

function run(cmd, args, label) {
  console.log(`\n—— ${label} ——`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`${label} failed with exit ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const root = path.resolve(__dirname, '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;

run(npx, ['prisma', 'migrate', 'deploy'], 'Prisma migrate deploy');
run(
  node,
  [path.join(root, 'scripts/apply-sql.js'), path.join(root, 'supabase/migrations')],
  'Supabase SQL (RLS / policies)',
);

console.log('\ndb-migrate-all: done.');
