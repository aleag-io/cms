# Preview Environment Setup Plan

**Status:** Deferred — GitHub and Vercel configuration complete; Supabase configuration remains.

## Goal

Provide a stable, production-like preview environment for stakeholder review and QA without
allowing preview deployments to read, modify, or migrate the production Supabase project.

## Target topology

| Environment | Application | Data and Auth |
| --- | --- | --- |
| Production | Production Vercel domain and `main` branch | Production Supabase project |
| Stable preview | Custom preview domain and long-lived preview branch | Dedicated preview Supabase project |
| Pull request previews | Vercel-generated deployment URLs | Preview Supabase project; migrations disabled by default |
| Local development | `localhost` | Local Supabase stack |

The stable preview branch is the only preview deployment that should apply database migrations.
All other PR previews may use the preview project for testing, but must not race to apply schema
or RLS changes.

## Completed

- [x] GitHub repository and branch workflow configured.
- [x] Vercel project configured.
- [x] Stable preview domain configured in Vercel.
- [x] Preview deployments configured from GitHub.
- [x] Application build already skips migrations when `VERCEL_ENV=preview` unless
  `MIGRATE_ON_PREVIEW=1` (`scripts/db-migrate-all.js`).

## Remaining work

### 1. Create a dedicated Supabase preview project

- [ ] Create a separate Supabase project for preview; do not reuse production.
- [ ] Record its project URL, anon key, service-role key, direct Postgres connection string,
  and database password in the approved secret manager.
- [ ] Confirm the direct/non-pooled database connection supports Prisma migrations.
- [ ] Confirm production credentials are not present in Vercel's Preview environment.

### 2. Configure Supabase Auth

- [ ] Set the preview Supabase **Site URL** to the stable preview domain.
- [ ] Add the stable preview callback URL to the Auth redirect allow list:
  `https://<preview-domain>/auth/callback`.
- [ ] Add `http://localhost:3000/**` only if this Supabase project will also support local
  callback testing.
- [ ] Decide whether login must work on ephemeral PR URLs. If required, add the narrow Vercel
  wildcard recommended by Supabase for this Vercel team; otherwise allow only the stable domain.
- [ ] Configure email templates and sender behavior for preview so test emails are visibly
  non-production and cannot be confused with live messages.
- [ ] Replicate any required Auth hook configuration, including the access-token claims hook.

### 3. Configure Vercel Preview environment variables

Set these for the Vercel **Preview** environment using preview-only values:

```text
NEXT_PUBLIC_APP_URL=https://<preview-domain>
NEXT_PUBLIC_SUPABASE_URL=<preview-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<preview-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<preview-service-role-key>
DATABASE_URL=<preview-direct-database-url>
POSTGRES_URL_NON_POOLING=<preview-direct-database-url>
```

- [ ] Mark server-side credentials as sensitive.
- [ ] Configure preview-safe values for `CRON_SECRET` and any enabled Stripe, Resend, or Twilio
  integration.
- [ ] Disable external delivery or use vendor sandbox/test credentials until preview messaging
  behavior is explicitly approved.
- [ ] Set `MIGRATE_ON_PREVIEW=1` as a **branch-specific override only** for the stable preview
  branch. Do not set it globally for all Preview deployments.
- [ ] Redeploy after environment-variable changes; existing deployments do not receive new
  values automatically.

### 4. Initialize the preview database

- [ ] From the stable preview branch, apply the complete migration stack in the required order:
  Prisma migrations first, then Supabase SQL migrations.
- [ ] Verify `_app_sql_migrations` contains the applied Supabase migration records.
- [ ] Seed only synthetic preview data. Never copy production member, pastoral, sacramental,
  finance, audit, or authentication data into preview.
- [ ] Create designated preview administrator and test-role accounts using non-production email
  addresses.

The existing deployment build invokes `npm run db:migrate:all`, which performs the required
ordering. Preview migration execution must remain restricted to the stable branch.

### 5. Validate the environment

- [ ] Open the stable preview domain and complete login and logout.
- [ ] Verify the JWT contains the expected `app_metadata` tenant and role claims.
- [ ] Exercise one account for each representative role: diocese admin, parish admin, parish
  staff, ministry leader, and member.
- [ ] Run cross-parish isolation checks and confirm Parish A cannot read Parish B data.
- [ ] Confirm create, update, denied-attempt, and privileged-read actions produce append-only
  audit entries.
- [ ] Verify the Supabase access-token hook, RLS policies, grants, security-definer helpers,
  views, and immutable audit protections are installed.
- [ ] Confirm a normal PR preview build reports that database migrations were skipped.
- [ ] Confirm the stable preview branch can apply a new migration exactly once.
- [ ] Test cron endpoints with the preview secret and confirm they cannot send production
  communications.
- [ ] Run a smoke test of registration, approval, directory visibility, sharing, sacramental
  access, and liturgical visibility.

### 6. Operational safeguards

- [ ] Enable preview deployment protection unless anonymous access is specifically required.
- [ ] Document who may access the preview Supabase dashboard and rotate its credentials.
- [ ] Establish a reset procedure that rebuilds preview from migrations and synthetic seed data.
- [ ] Configure a spending limit or alert for the preview Supabase project and external vendors.
- [ ] Add a visible preview-environment indicator in the UI if stakeholder confusion with
  production is likely.

## Completion criteria

The preview environment is complete when:

1. The stable preview domain authenticates against a dedicated Supabase preview project.
2. No Preview-scoped Vercel variable contains a production database or service-role credential.
3. The full Prisma and Supabase SQL migration tracks are installed and verified.
4. RLS tenant isolation, claims injection, and append-only auditing pass smoke tests.
5. PR deployments skip migrations while the stable preview branch can apply them safely.
6. All stored data is synthetic and all outbound integrations are sandboxed or disabled.

## Deferred decisions

- Whether ephemeral PR deployments need working Supabase Auth or only the stable preview domain
  does.
- Whether all PR deployments share the preview database or only the stable preview branch is
  allowed to connect to it.
- Whether preview data should be reset on a schedule or only on demand.
- Whether preview needs anonymous public routes or should remain protected by Vercel.

