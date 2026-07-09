/**
 * Local recovery: link Supabase Auth user admin@cms.local → AppUser DIOCESE_ADMIN.
 *
 * Integration tests TRUNCATE public "AppUser" but leave auth.users intact.
 * Login then "succeeds" (Auth 200) while AuthenticatedLayout finds no AppUser
 * and redirects back to /login.
 *
 * Usage (with supabase running + .env.local):
 *   node scripts/ensure-local-admin.js
 */
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const fs = require('fs');

function loadEnv() {
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // rely on process.env
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const email = process.env.LOCAL_ADMIN_EMAIL ?? 'admin@cms.local';
  const password = process.env.LOCAL_ADMIN_PASSWORD ?? 'Admin@Local1';

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure auth user exists
  let authUserId = null;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    authUserId = existing.id;
    // Keep password in sync for local convenience
    await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
    });
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    authUserId = created.data.user.id;
  }

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    // Prefer existing diocese/parish from fixtures or bootstrap
    const diocese = await pg.query(
      `SELECT id FROM "Diocese" ORDER BY "createdAt" ASC NULLS LAST LIMIT 1`,
    );
    if (diocese.rowCount === 0) {
      throw new Error('No Diocese row — run bootstrap or prisma seed first');
    }
    const dioceseId = diocese.rows[0].id;

    await pg.query(
      `INSERT INTO "AppUser"(
         id, email, "displayName", role, "dioceseId", "parishId",
         "isActive", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, 'DIOCESE_ADMIN', $4, NULL, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = 'DIOCESE_ADMIN',
         "dioceseId" = EXCLUDED."dioceseId",
         "parishId" = NULL,
         "isActive" = true,
         "updatedAt" = now()`,
      [authUserId, email, 'Diocese Admin', dioceseId],
    );

    console.log(`OK: linked ${email} → AppUser ${authUserId} (DIOCESE_ADMIN)`);
    console.log(`Sign in with password: ${password}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
