# Environments & Domains — Requirements (Vercel + Supabase)

> Owner: platform/ops. Status: requirements to finish configuring production, a stable preview,
> and per-branch environments across Vercel and Supabase. Grounded in the live state on 2026-07-12.

## 0. Status — native branching foundation (on `main`)

The **code foundation** for Supabase native branching is now on `main`, so every branch inherits
a working branch DB (schema + RLS + claims hook) instead of an empty database:

- `scripts/generate-supabase-branch-bundle.js` merges `prisma/migrations/*` (schema) +
  `supabase/migrations/*` (RLS/hooks) into the deployable bundle at
  `supabase-branch/supabase/migrations`, plus a branch `config.toml`
  (`db.migrations.enabled = true`, `db.seed.enabled = true`) and `migration-manifest.json`.
- `npm run db:branch:generate` regenerates the bundle; `npm run db:branch:check` fails if it is
  stale. CI runs the check (and `ci` starts with it) so the bundle can never drift from the
  canonical migrations. **Re-run `db:branch:generate` and commit after adding any Prisma or
  `supabase/` migration.**
- `supabase/migrations/20260712130000_claims_hook_public.sql` installs the access-token hook in the
  **`public`** schema — hosted/branch Supabase reserves ownership of `auth`, so the claims hook must
  live in `public` for branch DBs to authenticate.

**Remaining steps are dashboard-only (owner must do them — not CLI-scriptable):**

1. **Supabase → Project → Integrations → GitHub → Branching:** set the **working directory to
   `supabase-branch`** and enable migration application on branches. Keep **production deployments
   disabled** (prod schema is applied by the Vercel build, never by Supabase branching — see §4.1).
2. **Reset the existing empty branch DBs** so they re-apply the bundle from scratch. Verified empty
   on 2026-07-13: the `preview` branch (`fnvayegctruotqnutswv`) has **0 public tables**. In
   Supabase → Branching, reset/recreate each branch (or push a new commit to trigger a fresh
   migration run). Also make the **`preview` branch persistent** (currently `persistent: false`) so
   `preview.cms.aleag.io` survives PR churn.
3. **Vercel → Project → Settings → Deployment Protection → Vercel Authentication → Off** (or scope
   it) so test users can open `preview.cms.aleag.io` without a Vercel SSO login.

After (1)+(2), a fresh push to any branch provisions a branch DB with the full schema + RLS +
`public` claims hook. Verify by querying the branch DB for a non-empty `AppUser`/`Account` table.

## 1. Current state (observed)

| Thing | Value |
| --- | --- |
| Vercel project | `cms` (`prj_oTkVF8nRLxzyj8vkLxaLRgyPjoDP`), team `aleag` (`team_B5g2S7bXLq9Yb7ABS9FZx99D`), Node 24.x |
| Vercel domains attached | `cms.aleag.io` (prod), `cms-aleag.vercel.app`, `cms-beta-ruby-44.vercel.app`, `cms-git-main-aleag.vercel.app` |
| Supabase prod project | `cms` ref `nehywddvywocalnhuqig`, region `us-east-1`, Postgres 17, ACTIVE_HEALTHY |
| Supabase branching | **Enabled & working.** `main` branch = prod project; PR #59 has an ephemeral branch DB `phxoklfceusvwkeddvxc` (persistent=false, with_data=false, ACTIVE_HEALTHY). Working dir = `supabase-branch/`. |
| Env vars in Vercel | Only the **Supabase-integration** set (`SUPABASE_*`, `POSTGRES_*`) — a base set on Production/Preview/Development (→ prod DB) plus a **branch-scoped override** on `Preview (feature/r5-batch-donations)` (→ branch DB). |
| Latest deployment | **ERROR** — commit `6b23088`, `errorCode: BUILD_FAILED`, `"Resource provisioning failed"`, failed in ~1.7s with no build logs (platform provisioning, not a code error). Prior commit `7eeb272` deployed READY. |

### DB env-var mapping (confirmed — do NOT add `DATABASE_URL` to Vercel)
- Runtime (`lib/prisma.ts`): `DATABASE_URL ?? POSTGRES_URL` (pooler + SSL). `POSTGRES_URL` is provisioned → works.
- Migrations (`prisma.config.ts`, `scripts/db-migrate-all.js`, `scripts/apply-sql.js`): `DATABASE_URL ?? POSTGRES_URL_NON_POOLING` (direct). `POSTGRES_URL_NON_POOLING` is provisioned → works.
- `DATABASE_URL` is a **local-only** var (`.env.local`). Leave it unset in Vercel.

### Migration strategy per environment (as Copilot wired it — keep this)
- **Production (main):** Vercel `npm run build` runs `db:migrate:all` against the prod DB (`POSTGRES_URL_NON_POOLING`). Schema + RLS land on deploy.
- **Preview / per-branch:** the **Supabase branching integration** applies the merged migration bundle in `supabase-branch/supabase/migrations` to the ephemeral branch DB. The Vercel build **skips** `db:migrate:all` on preview (`MIGRATE_ON_PREVIEW` unset). **Do not set `MIGRATE_ON_PREVIEW=1`** — it would double-apply (harmless if idempotent, but redundant) and race the branch provisioning.
- Keep `supabase-branch/` in sync: after any new Prisma or `supabase/` migration, run `npm run db:branch:generate` and commit; CI enforces via `npm run db:branch:check`.

## 2. Target topology (three tiers)

| Tier | Vercel | Domain | Supabase DB | Migrations by |
| --- | --- | --- | --- | --- |
| **Production** | Production (branch `main`) | `cms.aleag.io` | prod project `nehywddvywocalnhuqig` (branch `main`) | Vercel build `db:migrate:all` |
| **Preview (stable)** | one designated long-lived branch, e.g. `staging` | `preview.cms.aleag.io` | **persistent** Supabase branch off prod | Supabase branching |
| **Per-branch (ephemeral)** | every other branch / PR | auto `cms-git-<branch>-aleag.vercel.app` (optionally `*.cms.aleag.io`) | ephemeral Supabase branch per PR | Supabase branching |

## 3. Requirements — Vercel

### 3.1 App-secret environment variables (MISSING — highest priority)
The Supabase integration provisions DB/auth keys, but **none of the app's own secrets are set**. Add these (scopes noted). Where a value differs per environment, set separate Production and Preview values.

| Var | Prod | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://cms.aleag.io` | `https://preview.cms.aleag.io` | Public site URL. For ephemeral branches leave to fall back to `VERCEL_URL` at runtime, or omit. |
| `CRON_SECRET` | strong random | (optional) | Guards `/api/jobs/*` crons (in `vercel.json`). Required for cron auth. |
| `STRIPE_SECRET_KEY` | live `sk_live_…` | test `sk_test_…` | Online giving. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live `pk_live_…` | test `pk_test_…` | |
| `STRIPE_WEBHOOK_SECRET` | prod endpoint secret | preview endpoint secret | Per Stripe webhook endpoint (see §5). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token | Vercel Blob token | Giving-statement PDF storage (falls back to on-demand render if unset). |
| `RESEND_API_KEY` | live | test/sandbox | Email (statements, comms). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | live | test | SMS (optional). |

Set via dashboard or CLI, e.g. `vercel env add NEXT_PUBLIC_APP_URL production`.

### 3.2 Domains
- **Production:** `cms.aleag.io` → already attached to Production. Verify it targets Production (branch `main`), not a preview.
- **Preview (stable):** add `preview.cms.aleag.io` and assign it to the **`staging`** branch (Project → Settings → Domains → add domain → "Git Branch: staging"). Create the `staging` branch first (§4).
- **Per-branch:** the auto `cms-git-<branch>-aleag.vercel.app` needs no config. **Optional** custom per-branch subdomains: add a wildcard `*.cms.aleag.io` domain and assign it to Preview deployments (each branch resolves to `<branch>.cms.aleag.io`). Requires a DNS `CNAME *.cms.aleag.io → cname.vercel-dns.com` (or Vercel nameservers) — decide if wanted; not required for functionality.

### 3.3 Build / deploy
- Keep `buildCommand: npm run build` (runs `db:migrate:all` — prod applies, preview skips).
- Investigate/redeploy the **ERROR** deployment (§6).

## 4. Requirements — Supabase

### 4.1 Branching (already enabled — verify)
- Confirm branching is enabled on `nehywddvywocalnhuqig` with GitHub integration **working directory = `supabase-branch`** and **production deployments disabled** (per AGENTS.md: never enable Supabase prod deploy — production schema is applied by the Vercel build, not by Supabase branching).
- Ephemeral PR branches (`with_data=false`) are expected and already working.

### 4.2 Persistent staging branch (for `preview.cms.aleag.io`)
- Create a **persistent** branch named `staging` (persistent=true) off prod so `preview.cms.aleag.io` has a stable DB that survives PR churn. Decide `with_data` (copy prod data vs empty + seed).
- Point the Vercel `staging` branch's Supabase env vars at this persistent branch (the integration wires branch-scoped vars automatically when the git branch exists).

### 4.3 Auth redirect / site URLs (CRITICAL for login on deployed domains)
Local `supabase/config.toml` has only `http://127.0.0.1:3000`. The **remote** project's Auth settings (Dashboard → Authentication → URL Configuration) must include:
- Site URL: `https://cms.aleag.io`
- Additional redirect URLs: `https://preview.cms.aleag.io`, `https://cms-aleag.vercel.app`, `https://cms-*-aleag.vercel.app` (wildcard for previews), plus any custom `*.cms.aleag.io`.
Without these, Supabase Auth logins/redirects fail on the deployed domains.

## 5. Stripe webhooks
Register endpoints in the Stripe dashboard (each yields the `STRIPE_WEBHOOK_SECRET` for that environment):
- Production: `https://cms.aleag.io/api/webhooks/stripe` (live mode).
- Preview: `https://preview.cms.aleag.io/api/webhooks/stripe` (test mode) — optional.
`/api/webhooks/stripe` is already in the `proxy.ts` public allowlist and verifies the signature.

## 6. BLOCKER — branch/preview deploys fail: "Resource provisioning failed"

**Confirmed diagnosis (2026-07-12):** every deploy of a *non-main* branch fails at
`errorCode: BUILD_FAILED / "Resource provisioning failed"` in ~2–4s **before the build starts**.
Production (`main`) deploys succeed. Verified it is **not** code and **not** the committed CLI cache
(removed it; still fails; the prior commit `7eeb272` built READY). It is the **Vercel Marketplace
→ Supabase integration** failing to provision a per-Git-branch Supabase branch database for the
deployment.

**Why:** the integration creates a separate Supabase branch DB per Git branch. The *first* provision
for `feature/r5-batch-donations` succeeded (branch DB `phxoklfceusvwkeddvxc`, and commit `7eeb272`
deployed READY). Every deploy since fails to provision — almost always because **branching has hit a
plan/compute limit or billing state** (preview branches are billable compute; free/trial credit
exhausted or branch cap reached), or the Marketplace integration connection is degraded.

**Fix — pick one (dashboard/billing; cannot be done from the CLI):**
- **Option A (recommended, simplest path to "prod + preview functional"):** stop provisioning a
  Supabase branch per Git branch. In Vercel → Project → Storage/Integrations → the Supabase
  integration, **disable automatic per-branch branching**, and instead point **Preview** deployments
  at ONE dedicated Supabase branch (the persistent `staging` branch in §4.2) via the Preview-scoped
  env vars. Production keeps using the prod project. Result: no per-deploy provisioning, no failures.
- **Option B:** in the Supabase dashboard → Branching, confirm the plan **allows branching** and has
  compute budget; upgrade/repair billing so provisioning succeeds; then per-PR ephemeral branches
  work again.
- **Immediate validation without fixing this:** the last **READY** preview is commit `7eeb272`
  (alias `cms-git-feature-r5-batch-donations-aleag.vercel.app`). Use it to test PR #59, or merge #59
  to `main` (production deploys are unaffected).

**Already fixed here (code side):** removed the 7.6 MB Supabase CLI cache that Copilot committed under
`supabase-branch/supabase/.temp` and added the missing `.gitignore` (commit `b5b98a6`).

## 7. Prioritized checklist
1. [ ] Set the **app-secret env vars** (§3.1) for Production (and Preview where applicable). *Nothing Stripe/email/SMS/cron/Blob works in prod without these.*
2. [ ] Set the remote Supabase **Auth Site/redirect URLs** (§4.3). *Login is broken on cms.aleag.io until this is done.*
3. [ ] Confirm `cms.aleag.io` targets Production; **redeploy** the ERRORed deployment (§6).
4. [ ] Create the persistent **`staging`** branch (git + Supabase) and attach `preview.cms.aleag.io` to it (§3.2, §4.2).
5. [ ] Register **Stripe webhook** endpoints + capture the per-env `STRIPE_WEBHOOK_SECRET` (§5).
6. [ ] (Optional) wildcard `*.cms.aleag.io` for per-branch custom subdomains (§3.2).
7. [ ] Verify branch bundle stays in sync: `npm run db:branch:check` in CI (already wired).
