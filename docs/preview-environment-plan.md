# Preview Environment Setup Plan

**Status:** Repository support complete; Supabase and Vercel dashboard integration remains.

## Goal

Provide a stable, production-like preview environment for stakeholder review and QA without
allowing preview deployments to read, modify, or migrate the production Supabase project.

## Target topology

| Environment | Application | Data and Auth |
| --- | --- | --- |
| Production | Production Vercel domain and `main` branch | Production Supabase project |
| Stable preview | Custom preview domain and long-lived preview branch | Persistent Supabase branch |
| Pull request previews | Vercel-generated deployment URLs | Ephemeral Supabase branches |
| Local development | `localhost` | Local Supabase stack |

Supabase's GitHub integration owns preview-branch migrations. Vercel preview builds never apply
database migrations. Production remains Prisma-first through the Vercel production build.

## Completed

- [x] GitHub repository and branch workflow configured.
- [x] Vercel project configured.
- [x] Stable preview domain configured in Vercel.
- [x] Preview deployments configured from GitHub.
- [x] Application build already skips migrations when `VERCEL_ENV=preview` unless
  `MIGRATE_ON_PREVIEW=1` (`scripts/db-migrate-all.js`).
- [x] Native branch deployment bundle generated under `supabase-branch/supabase/`.
- [x] Prisma schema migrations and Supabase RLS migrations combined in dependency order.
- [x] CI checksum/drift validation via `npm run db:branch:check`.
- [x] Deterministic SQL branch seed with a synthetic Auth administrator.
- [x] Access-token hook installable by native branches from the `public` schema.

## Remaining work

### 1. Connect Supabase branching to GitHub

- [ ] In the production Supabase project, open **Project Settings → Integrations → GitHub**.
- [ ] Authorize `aleag-io/cms`.
- [ ] Set **Working directory** to `supabase-branch`.
- [ ] Enable **Automatic branching**.
- [ ] Keep **Deploy to production** disabled. Vercel remains the only production migration owner.
- [ ] Make the long-lived preview Git branch a persistent Supabase branch.
- [ ] Require the Supabase Preview status check before merging migration changes.

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

### 3. Connect Supabase branching to Vercel

- [ ] Install the Supabase Vercel integration and connect it to this Vercel project.
- [ ] Confirm each PR deployment receives credentials for its matching Supabase branch.
- [ ] Keep production Supabase credentials scoped only to Vercel Production.
- [ ] Set `NEXT_PUBLIC_APP_URL` appropriately for the stable preview domain.
- [ ] Configure preview-safe values for `CRON_SECRET` and any enabled Stripe, Resend, or Twilio
  integration.
- [ ] Disable external delivery or use vendor sandbox/test credentials until preview messaging
  behavior is explicitly approved.
- [ ] Do not set `MIGRATE_ON_PREVIEW=1`; Supabase owns preview-branch migrations.
- [ ] Redeploy after environment-variable changes; existing deployments do not receive new
  values automatically.

### 4. Initialize the preview database

- [ ] Push the stable preview branch and confirm Supabase applies the generated migration bundle.
- [ ] Confirm the native migration history contains every entry from
  `supabase-branch/supabase/migration-manifest.json`.
- [ ] Confirm the synthetic login works:
  `preview.admin@example.invalid / Preview@Local1`.
- [ ] Never copy production member, pastoral, sacramental, finance, audit, or authentication data
  into a branch.

Run `npm run db:branch:generate` whenever canonical Prisma or Supabase migrations change. The
generated bundle is the native-branch deployment input; the existing Vercel production build
continues to invoke `npm run db:migrate:all`.

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
- [ ] Confirm Vercel preview builds report that application-managed migrations were skipped.
- [ ] Confirm Supabase applies a new generated branch migration exactly once.
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
2. Every Vercel Preview deployment receives credentials for its matching Supabase branch.
3. The full Prisma and Supabase SQL migration tracks are installed and verified.
4. RLS tenant isolation, claims injection, and append-only auditing pass smoke tests.
5. Vercel previews skip migrations while Supabase branches apply the generated bundle safely.
6. All stored data is synthetic and all outbound integrations are sandboxed or disabled.

## Deferred decisions

- Whether ephemeral PR deployments need working Supabase Auth or only the stable preview domain
  does.
- Whether preview data should be reset on a schedule or only on demand.
- Whether preview needs anonymous public routes or should remain protected by Vercel.
