const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// This CLI doesn't get Next.js's automatic .env.local loading, and
// DATABASE_URL isn't normally exported to the shell — load it here so the
// script works whether or not the caller remembered to `source .env.local`.
// CI sets DATABASE_URL directly, so this is a no-op there.
if (!process.env.DATABASE_URL) {
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local not present — fall through and let the connection fail with
    // a clear error below instead of silently defaulting.
  }
}

// Each arg is a .sql file or a directory. Directories expand to their *.sql
// files in lexicographic (= timestamp) order, so passing the migrations folder
// applies every migration in sequence and new ones are picked up automatically.
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
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'FAILED: DATABASE_URL is not set and .env.local was not found. ' +
      'Set DATABASE_URL or run this from the project root with a .env.local present.',
  );
  process.exit(1);
}

/** Supabase pooler/direct URLs often set sslmode=require; strip and use explicit SSL. */
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

async function run() {
  for (const f of files) {
    console.log(`=== Applying ${f} ===`);
    const sql = fs.readFileSync(f, 'utf8');
    const client = new Client(clientConfig(url));
    try {
      await client.connect();
      await client.query(sql);
      console.log('OK');
    } catch (e) {
      console.error('FAILED:', e.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  }
}

run();
