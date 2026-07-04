const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local not present; downstream checks will fail with clear messages.
  }
}

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

function findLocalSupabaseDbContainer() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  const names = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return names.find((name) => name.startsWith('supabase_db_')) ?? null;
}

async function applyWithPg(files, url) {
  for (const f of files) {
    console.log(`=== Applying ${f} via pg client ===`);
    const sql = fs.readFileSync(f, 'utf8');
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query(sql);
      console.log('OK');
    } finally {
      await client.end();
    }
  }
}

function applyWithDockerPsql(files, containerName) {
  for (const f of files) {
    console.log(`=== Applying ${f} via docker/psql (${containerName}) ===`);
    const sql = fs.readFileSync(f, 'utf8');
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
      {
        input: sql,
        encoding: 'utf8',
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'psql apply failed');
    }

    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    console.log('OK');
  }
}

const files = process.argv.slice(2).flatMap(expand);
const url = process.env.DATABASE_URL;

if (!files.length) {
  console.error('FAILED: no SQL files or directories provided.');
  process.exit(1);
}

if (!url) {
  console.error(
    'FAILED: DATABASE_URL is not set and .env.local was not found. ' +
      'Set DATABASE_URL or run this from the project root with a .env.local present.',
  );
  process.exit(1);
}

async function run() {
  const forcePg = process.env.APPLY_SQL_USE_DOCKER === '0';
  const containerName = forcePg ? null : findLocalSupabaseDbContainer();

  try {
    if (containerName) {
      applyWithDockerPsql(files, containerName);
      return;
    }

    await applyWithPg(files, url);
  } catch (e) {
    console.error('FAILED:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

run();
