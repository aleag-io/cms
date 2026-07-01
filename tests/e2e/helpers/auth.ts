/**
 * E2E auth helper.
 *
 * Creates a real Supabase auth user, links it to AppUser/Member rows, and mints
 * a session cookie that can be injected into the browser context — the same
 * `sb-<ref>-auth-token` cookie the app's middleware reads.
 *
 * Requires the full local Supabase stack (GoTrue). In CI (plain Postgres) the
 * auth endpoint is absent; callers should gate on `isSupabaseAuthUp()` and skip.
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    // no .env.local — fall back to process.env
  }
  return { ...env, ...process.env } as Record<string, string>;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const DATABASE_URL =
  env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Storage key is `sb-<first hostname label>-auth-token` (127.0.0.1 → sb-127-…).
const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const DIOCESE_ID = '00000000-0000-0000-0000-000000000001';
const PARISH_A_ID = '00000000-0000-0000-0000-000000000010';

export async function isSupabaseAuthUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'content-type': 'application/json',
  };
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (createRes.ok) {
    const d = (await createRes.json()) as { id?: string; user?: { id: string } };
    return d.id ?? d.user!.id;
  }
  // Already exists → find by listing.
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    { headers },
  );
  const list = (await listRes.json()) as { users?: Array<{ id: string; email: string }> };
  const found = (list.users ?? []).find((u) => u.email === email);
  if (!found) throw new Error(`Could not ensure auth user ${email}`);
  return found.id;
}

async function mintCookie(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Token grant failed (${res.status})`);
  const s = (await res.json()) as Record<string, unknown>;
  const session = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: 'bearer',
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    user: s.user,
  };
  return {
    name: COOKIE_NAME,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
  };
}

/**
 * Ensure a MEMBER-role user in Parish A with a seeded date-of-birth (to prove it
 * never reaches the directory) and at least one peer member. Returns the session
 * cookie for browser injection.
 */
export async function ensureMemberSession(): Promise<{
  cookie: { name: string; value: string };
}> {
  const email = 'member-e2e@cms.local';
  const password = 'E2ePassw0rd!';
  const uid = await ensureAuthUser(email, password);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO "AppUser"(id,email,"displayName",role,"dioceseId","parishId","isActive","createdAt","updatedAt")
       VALUES ($1,$2,'E2E Member','MEMBER',$3,$4,true,now(),now())
       ON CONFLICT (id) DO UPDATE SET role='MEMBER',"parishId"=$4,"isActive"=true`,
      [uid, email, DIOCESE_ID, PARISH_A_ID],
    );
    // Member row linked to the auth user (self), in Parish A.
    await c.query(
      `INSERT INTO "Member"(id,"dioceseId","parishId","userId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$1,'900.1','Eve','E2E','eve-e2e@cms.local','ACTIVE',now(),now())
       ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$3`,
      [uid, DIOCESE_ID, PARISH_A_ID],
    );
    await c.query(
      `INSERT INTO "MemberParish"(id,"memberId","parishId","isPrimary","membershipType","joinedAt","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,true,'PRIMARY',now(),now(),now())
       ON CONFLICT ("memberId","parishId") DO NOTHING`,
      [uid, PARISH_A_ID],
    );
    // Seed a DOB in the satellite table — must NEVER appear in the directory.
    await c.query(
      `INSERT INTO "MemberPastoralData"(id,"memberId","parishId","dateOfBirth","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,'1990-07-04',now(),now())
       ON CONFLICT ("memberId") DO UPDATE SET "dateOfBirth"='1990-07-04'`,
      [uid, PARISH_A_ID],
    );
    // Ensure a peer member exists in Parish A so the directory shows >1 row.
    await c.query(
      `INSERT INTO "Member"(id,"dioceseId","parishId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
       VALUES ('00000000-0000-0000-0000-000000000902'::uuid,$1,$2,'901.1','Peer','Member','peer-e2e@cms.local','ACTIVE',now(),now())
       ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$2`,
      [DIOCESE_ID, PARISH_A_ID],
    );
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool.end();
  }

  const cookie = await mintCookie(email, password);
  return { cookie };
}
