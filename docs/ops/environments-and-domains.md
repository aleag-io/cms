# Environments & Domains — Requirements (Vercel + Supabase)

> Owner: platform/ops. Status: requirements to finish configuring production, a stable preview,
> and per-branch environments across Vercel and Supabase. Grounded in the live state on 2026-07-12.

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

## 6. Open issue — the ERROR deployment
- `dpl_DrA5se…` (commit `6b23088`) failed with `"Resource provisioning failed"` before building. This is a Vercel/Supabase **provisioning** failure (likely a transient race with the Supabase branch DB creation), not a code error — the prior commit built fine.
- **Action:** redeploy the branch HEAD (Vercel → Deployments → Redeploy, or push an empty commit). If it recurs consistently, check the Supabase org's branch quota/limits and the Vercel↔Supabase integration connection.

## 7. Prioritized checklist
1. [ ] Set the **app-secret env vars** (§3.1) for Production (and Preview where applicable). *Nothing Stripe/email/SMS/cron/Blob works in prod without these.*
2. [ ] Set the remote Supabase **Auth Site/redirect URLs** (§4.3). *Login is broken on cms.aleag.io until this is done.*
3. [ ] Confirm `cms.aleag.io` targets Production; **redeploy** the ERRORed deployment (§6).
4. [ ] Create the persistent **`staging`** branch (git + Supabase) and attach `preview.cms.aleag.io` to it (§3.2, §4.2).
5. [ ] Register **Stripe webhook** endpoints + capture the per-env `STRIPE_WEBHOOK_SECRET` (§5).
6. [ ] (Optional) wildcard `*.cms.aleag.io` for per-branch custom subdomains (§3.2).
7. [ ] Verify branch bundle stays in sync: `npm run db:branch:check` in CI (already wired).
