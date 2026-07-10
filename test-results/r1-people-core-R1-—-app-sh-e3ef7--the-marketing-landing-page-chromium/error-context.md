# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r1-people-core.test.ts >> R1 — app shell & dashboard >> sign out returns to the marketing landing page
- Location: tests/e2e/r1-people-core.test.ts:73:7

# Error details

```
error: insert or update on table "AppUser" violates foreign key constraint "AppUser_dioceseId_fkey"
```

# Test source

```ts
  17  |     for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  18  |       const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  19  |       if (m) env[m[1]] = m[2].trim();
  20  |     }
  21  |   } catch {
  22  |     // no .env.local — fall back to process.env
  23  |   }
  24  |   return { ...env, ...process.env } as Record<string, string>;
  25  | }
  26  | 
  27  | const env = loadEnv();
  28  | const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  29  | const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  30  | const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  31  | const DATABASE_URL =
  32  |   env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  33  | 
  34  | // Storage key is `sb-<first hostname label>-auth-token` (127.0.0.1 → sb-127-…).
  35  | const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  36  | 
  37  | const DIOCESE_ID = '00000000-0000-0000-0000-000000000001';
  38  | const PARISH_A_ID = '00000000-0000-0000-0000-000000000010';
  39  | 
  40  | export async function isSupabaseAuthUp(): Promise<boolean> {
  41  |   try {
  42  |     const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
  43  |       signal: AbortSignal.timeout(2000),
  44  |     });
  45  |     return res.ok;
  46  |   } catch {
  47  |     return false;
  48  |   }
  49  | }
  50  | 
  51  | async function ensureAuthUser(email: string, password: string): Promise<string> {
  52  |   const headers = {
  53  |     apikey: SERVICE_KEY,
  54  |     Authorization: `Bearer ${SERVICE_KEY}`,
  55  |     'content-type': 'application/json',
  56  |   };
  57  |   const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  58  |     method: 'POST',
  59  |     headers,
  60  |     body: JSON.stringify({ email, password, email_confirm: true }),
  61  |   });
  62  |   if (createRes.ok) {
  63  |     const d = (await createRes.json()) as { id?: string; user?: { id: string } };
  64  |     return d.id ?? d.user!.id;
  65  |   }
  66  |   // Already exists → find by listing.
  67  |   const listRes = await fetch(
  68  |     `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
  69  |     { headers },
  70  |   );
  71  |   const list = (await listRes.json()) as { users?: Array<{ id: string; email: string }> };
  72  |   const found = (list.users ?? []).find((u) => u.email === email);
  73  |   if (!found) throw new Error(`Could not ensure auth user ${email}`);
  74  |   return found.id;
  75  | }
  76  | 
  77  | async function mintCookie(email: string, password: string) {
  78  |   const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  79  |     method: 'POST',
  80  |     headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
  81  |     body: JSON.stringify({ email, password }),
  82  |   });
  83  |   if (!res.ok) throw new Error(`Token grant failed (${res.status})`);
  84  |   const s = (await res.json()) as Record<string, unknown>;
  85  |   const session = {
  86  |     access_token: s.access_token,
  87  |     refresh_token: s.refresh_token,
  88  |     token_type: 'bearer',
  89  |     expires_in: s.expires_in,
  90  |     expires_at: s.expires_at,
  91  |     user: s.user,
  92  |   };
  93  |   return {
  94  |     name: COOKIE_NAME,
  95  |     value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
  96  |   };
  97  | }
  98  | 
  99  | /**
  100 |  * Ensure a MEMBER-role user in Parish A with a seeded date-of-birth (to prove it
  101 |  * never reaches the directory), work notes and a clergy-only private note (to
  102 |  * prove role projection), and at least one peer member. Returns the session
  103 |  * cookie for browser injection plus the member id (= auth uid).
  104 |  */
  105 | export async function ensureMemberSession(): Promise<{
  106 |   cookie: { name: string; value: string };
  107 |   memberId: string;
  108 | }> {
  109 |   const email = 'member-e2e@cms.local';
  110 |   const password = 'E2ePassw0rd!';
  111 |   const uid = await ensureAuthUser(email, password);
  112 | 
  113 |   const pool = new Pool({ connectionString: DATABASE_URL });
  114 |   const c = await pool.connect();
  115 |   try {
  116 |     await c.query('BEGIN');
> 117 |     await c.query(
      |     ^ error: insert or update on table "AppUser" violates foreign key constraint "AppUser_dioceseId_fkey"
  118 |       `INSERT INTO "AppUser"(id,email,"displayName",role,"dioceseId","parishId","isActive","createdAt","updatedAt")
  119 |        VALUES ($1,$2,'E2E Member','MEMBER',$3,$4,true,now(),now())
  120 |        ON CONFLICT (id) DO UPDATE SET role='MEMBER',"parishId"=$4,"isActive"=true`,
  121 |       [uid, email, DIOCESE_ID, PARISH_A_ID],
  122 |     );
  123 |     // Member row linked to the auth user (self), in Parish A.
  124 |     await c.query(
  125 |       `INSERT INTO "Member"(id,"dioceseId","parishId","userId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
  126 |        VALUES ($1,$2,$3,$1,'900.1','Eve','E2E','eve-e2e@cms.local','ACTIVE',now(),now())
  127 |        ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$3`,
  128 |       [uid, DIOCESE_ID, PARISH_A_ID],
  129 |     );
  130 |     await c.query(
  131 |       `INSERT INTO "MemberParish"(id,"memberId","parishId","isPrimary","membershipType","joinedAt","createdAt","updatedAt")
  132 |        VALUES (gen_random_uuid(),$1,$2,true,'PRIMARY',now(),now(),now())
  133 |        ON CONFLICT ("memberId","parishId") DO NOTHING`,
  134 |       [uid, PARISH_A_ID],
  135 |     );
  136 |     // Seed a DOB in the satellite table — must NEVER appear in the directory.
  137 |     await c.query(
  138 |       `INSERT INTO "MemberPastoralData"(id,"memberId","parishId","dateOfBirth","createdAt","updatedAt")
  139 |        VALUES (gen_random_uuid(),$1,$2,'1990-07-04',now(),now())
  140 |        ON CONFLICT ("memberId") DO UPDATE SET "dateOfBirth"='1990-07-04'`,
  141 |       [uid, PARISH_A_ID],
  142 |     );
  143 |     // Work notes (staff/admin-visible) and a clergy-only private note — the
  144 |     // per-role profile visibility test asserts exactly who sees these.
  145 |     await c.query(
  146 |       `UPDATE "Member" SET "workNotes"='E2E work note' WHERE id=$1`,
  147 |       [uid],
  148 |     );
  149 |     await c.query(
  150 |       `INSERT INTO "MemberPrivateNote"(id,"memberId","parishId",note,"createdAt","updatedAt")
  151 |        VALUES (gen_random_uuid(),$1,$2,'E2E private pastoral note',now(),now())
  152 |        ON CONFLICT ("memberId") DO UPDATE SET note='E2E private pastoral note'`,
  153 |       [uid, PARISH_A_ID],
  154 |     );
  155 |     // Ensure a peer member exists in Parish A so the directory shows >1 row.
  156 |     await c.query(
  157 |       `INSERT INTO "Member"(id,"dioceseId","parishId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
  158 |        VALUES ('00000000-0000-0000-0000-000000000902'::uuid,$1,$2,'901.1','Peer','Member','peer-e2e@cms.local','ACTIVE',now(),now())
  159 |        ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$2`,
  160 |       [DIOCESE_ID, PARISH_A_ID],
  161 |     );
  162 |     await c.query('COMMIT');
  163 |   } catch (e) {
  164 |     await c.query('ROLLBACK');
  165 |     throw e;
  166 |   } finally {
  167 |     c.release();
  168 |     await pool.end();
  169 |   }
  170 | 
  171 |   const cookie = await mintCookie(email, password);
  172 |   return { cookie, memberId: uid };
  173 | }
  174 | 
  175 | /**
  176 |  * Ensure a Parish-A user with the given AppUser role (and, for clergy, an
  177 |  * active CLERGY ParishOfficer assignment on their own Member row — the Phase 7
  178 |  * derivation the claims pipeline keys on). Returns the session cookie.
  179 |  */
  180 | async function ensureRoleSession(opts: {
  181 |   email: string;
  182 |   displayName: string;
  183 |   role: 'PARISH_ADMIN' | 'PARISH_STAFF' | 'MEMBER';
  184 |   memberIdentifier?: string;
  185 |   clergyOfficer?: boolean;
  186 | }): Promise<{ cookie: { name: string; value: string }; userId: string }> {
  187 |   const password = 'E2ePassw0rd!';
  188 |   const uid = await ensureAuthUser(opts.email, password);
  189 | 
  190 |   const pool = new Pool({ connectionString: DATABASE_URL });
  191 |   const c = await pool.connect();
  192 |   try {
  193 |     await c.query('BEGIN');
  194 |     await c.query(
  195 |       `INSERT INTO "AppUser"(id,email,"displayName",role,"dioceseId","parishId","isActive","createdAt","updatedAt")
  196 |        VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())
  197 |        ON CONFLICT (id) DO UPDATE SET role=$4,"parishId"=$6,"isActive"=true`,
  198 |       [uid, opts.email, opts.displayName, opts.role, DIOCESE_ID, PARISH_A_ID],
  199 |     );
  200 |     if (opts.memberIdentifier) {
  201 |       await c.query(
  202 |         `INSERT INTO "Member"(id,"dioceseId","parishId","userId","memberIdentifier","firstName","lastName",email,status,"createdAt","updatedAt")
  203 |          VALUES ($1,$2,$3,$1,$4,$5,'E2E',$6,'ACTIVE',now(),now())
  204 |          ON CONFLICT (id) DO UPDATE SET status='ACTIVE',"parishId"=$3`,
  205 |         [
  206 |           uid,
  207 |           DIOCESE_ID,
  208 |           PARISH_A_ID,
  209 |           opts.memberIdentifier,
  210 |           opts.displayName,
  211 |           opts.email,
  212 |         ],
  213 |       );
  214 |     }
  215 |     if (opts.clergyOfficer) {
  216 |       const existing = await c.query(
  217 |         `SELECT id FROM "ParishOfficer" WHERE "memberId"=$1 AND "officerType"='CLERGY'`,
```