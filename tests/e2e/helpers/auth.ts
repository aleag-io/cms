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
 * never reaches the directory), work notes and a clergy-only private note (to
 * prove role projection), and at least one peer member. Returns the session
 * cookie for browser injection plus the member id (= auth uid).
 */
export async function ensureMemberSession(): Promise<{
  cookie: { name: string; value: string };
  memberId: string;
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
    // Work notes (staff/admin-visible) and a clergy-only private note — the
    // per-role profile visibility test asserts exactly who sees these.
    await c.query(
      `UPDATE "Member" SET "workNotes"='E2E work note' WHERE id=$1`,
      [uid],
    );
    await c.query(
      `INSERT INTO "MemberPrivateNote"(id,"memberId","parishId",note,"createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,'E2E private pastoral note',now(),now())
       ON CONFLICT ("memberId") DO UPDATE SET note='E2E private pastoral note'`,
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
  return { cookie, memberId: uid };
}

/**
 * Ensure a Parish-A user with the given AppUser role (and, for clergy, an
 * active CLERGY ParishOfficer assignment on their own Member row — the Phase 7
 * derivation the claims pipeline keys on). Returns the session cookie.
 */
async function ensureRoleSession(opts: {
  email: string;
  displayName: string;
  role: 'PARISH_ADMIN' | 'PARISH_STAFF' | 'MEMBER';
  memberIdentifier?: string;
  clergyOfficer?: boolean;
}): Promise<{ cookie: { name: string; value: string }; userId: string }> {
  const password = 'E2ePassw0rd!';
  const uid = await ensureAuthUser(opts.email, password);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO "AppUser"(id,email,"displayName",role,"dioceseId","parishId","isActive","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())
       ON CONFLICT (id) DO UPDATE SET role=$4,"parishId"=$6,"isActive"=true`,
      [uid, opts.email, opts.displayName, opts.role, DIOCESE_ID, PARISH_A_ID],
    );
    if (opts.memberIdentifier) {
      await c.query(
        `INSERT INTO "Member"(id,"dioceseId","parishId","userId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
         VALUES ($1,$2,$3,$1,$4,$5,'E2E',$6,'ACTIVE',now(),now())
         ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$3`,
        [
          uid,
          DIOCESE_ID,
          PARISH_A_ID,
          opts.memberIdentifier,
          opts.displayName,
          opts.email,
        ],
      );
    }
    if (opts.clergyOfficer) {
      const existing = await c.query(
        `SELECT id FROM "ParishOfficer" WHERE "memberId"=$1 AND "officerType"='CLERGY'`,
        [uid],
      );
      if (existing.rowCount === 0) {
        await c.query(
          `INSERT INTO "ParishOfficer"(id,"parishId","memberId",title,"officerType","isActive","createdAt","updatedAt")
           VALUES (gen_random_uuid(),$1,$2,'Vicar','CLERGY',true,now(),now())`,
          [PARISH_A_ID, uid],
        );
      } else {
        await c.query(
          `UPDATE "ParishOfficer" SET "isActive"=true WHERE "memberId"=$1 AND "officerType"='CLERGY'`,
          [uid],
        );
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool.end();
  }

  const cookie = await mintCookie(opts.email, password);
  return { cookie, userId: uid };
}

/** Parish-A PARISH_ADMIN session. */
export function ensureAdminSession() {
  return ensureRoleSession({
    email: 'admin-e2e@cms.local',
    displayName: 'E2E Admin',
    role: 'PARISH_ADMIN',
  });
}

/** Parish-A PARISH_STAFF session. */
export function ensureStaffSession() {
  return ensureRoleSession({
    email: 'staff-e2e@cms.local',
    displayName: 'E2E Staff',
    role: 'PARISH_STAFF',
  });
}

/** Name of Parish A (the parish every e2e session belongs to). */
export async function parishAName(): Promise<string> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT name FROM "Parish" WHERE id=$1`,
      [PARISH_A_ID],
    );
    if (!rows[0]) throw new Error('Parish A fixture missing');
    return rows[0].name as string;
  } finally {
    await pool.end();
  }
}

/** Parish-A clergy session: MEMBER role + active CLERGY officer assignment. */
export function ensureClergySession() {
  return ensureRoleSession({
    email: 'clergy-e2e@cms.local',
    displayName: 'E2E Clergy',
    role: 'MEMBER',
    memberIdentifier: '902.1',
    clergyOfficer: true,
  });
}
