# Demo data — local & preview

Synthetic data only. Never copy production member, pastoral, sacramental,
finance, or auth data into preview.

## Profiles

| Profile | Command | When |
| --- | --- | --- |
| `local` (default) | `npm run db:seed` | Day-to-day local development — fast enough to reseed often |
| `demo` | `npm run db:seed:demo` | Dense volumes for capability tours (local or remote) |
| preview apply | `npm run db:seed:preview` | `demo` profile against the disposable preview DB |

Optional overrides (any profile):

| Env | Meaning |
| --- | --- |
| `SEED_FAMILY_MULTIPLIER` | Repeat base family templates (demo default `2`) |
| `SEED_FINANCE_FULL_PARISHES` | Integer or `all` (demo default `all`) |
| `SEED_BATCH_MONTHS` | Sunday offering months (demo default `12`) |
| `SEED_SECONDARY_FRACTION` | Fraction of adults with multi-parish membership |

## What gets seeded (demo)

- **10 parishes** across the diocese (Dallas is parish 1 — best deep-dive)
- **~40–50 families / ~120–160 members per parish** (2× local templates)
- Dense **relationships** (spouse, parent/child, in-law, grandparent, cross-family)
- Multi-parish **secondary memberships** (~7% of adults)
- Programs, sessions, attendance; orgs + exclusive prayer groups; events + bookings
- Sacramental register; liturgical calendar (diocese + parish-local)
- Sharing lifecycle (requests, grants, emergency, secure link)
- **Finance on all parishes**: chart of accounts, periods, budgets, vendors/bills/payments,
  campaigns + pledges (incl. lapsed), monthly **categorized** Sunday batches
  (consolidated deposit journal per posted batch + one OPEN batch for data entry),
  online/external gifts (Zelle/ACH/card/stock), recon sample, draft journal +
  pending maker-checker approval
- Webhook subscriptions + delivery status samples

## Login accounts

Password for all: `Admin@Local1`

| Email | Role |
| --- | --- |
| `admin@cms.local` | DIOCESE_ADMIN |
| `diocese.staff@cms.local` | DIOCESE_STAFF |
| `reports@cms.local` | DIOCESE_REPORT_VIEWER |
| `parish1.admin@cms.local` | PARISH_ADMIN (Dallas) |
| `parish1.clergy@cms.local` | CLERGY |
| `parish1.staff@cms.local` | PARISH_STAFF |
| `parish1.member@cms.local` | MEMBER |
| `parish1.sharing@cms.local` | PARISH_DATA_SHARING_MANAGER |
| `parishN.*@cms.local` | Same pattern for parishes 2–10 |

Secure-link demo token (printed at end of seed): `demo-secure-share-token-r4`  
Path: `/share/demo-secure-share-token-r4`

After a **branch reset only**, the minimal SQL bootstrap login still works until
you re-run the full seed:

```text
preview.admin@example.invalid / Preview@Local1
```

## Reseed preview

Preview DB is the persistent Supabase branch (`fnvayegctruotqnutswv`). Data is
disposable. Coordinate with anyone mid-QA — seed **TRUNCATEs** tenant tables.

1. Resolve preview credentials (not production):

   ```bash
   # Example: env file from Supabase branch / Vercel Preview overrides
   export DATABASE_URL='postgresql://…@db.fnvayegctruotqnutswv…'
   export NEXT_PUBLIC_SUPABASE_URL='https://fnvayegctruotqnutswv.supabase.co'
   export SUPABASE_SERVICE_ROLE_KEY='…'
   ```

2. Run:

   ```bash
   npm run db:seed:preview
   ```

3. Confirm `https://preview.cms.aleag.io/api/health` still reports project ref
   `fnvayegctruotqnutswv` and `consistent: true`.

4. Log in as `admin@cms.local` / `Admin@Local1` and smoke the checklist below.

**Safety:** production project `nehywddvywocalnhuqig` is refused even with
`SEED_ALLOW_REMOTE=1`. Never point `DATABASE_URL` at production for seed.

## Capability walkthrough checklist

Suggested order on `preview.cms.aleag.io` (use Dallas / parish1 accounts):

1. **People** — `/members`, `/families`, member profile relationships tab  
2. **Directory / self-service** — `/directory`, `/self-service` (member login)  
3. **Registrations** — `/registrations` (pending queue)  
4. **Programs & orgs** — `/programs` attendance grid, `/organizations` roster  
5. **Events & facilities** — `/events`, `/facilities` bookings  
6. **Messages** — `/messages` (sent / queued / failed)  
7. **Sacramental** — `/sacramental-records`, member Sacramental tab  
8. **Sharing** — `/sharing`, secure link `/share/…`  
9. **Finance** — `/finance/*` batches, donations, journals (pending approval), budgets  
10. **Reports** — `/reports`, especially receipts-payments  
11. **Diocese** — `/diocese/aggregate`, `/diocese/finance` (diocese admin)  
12. **Integrations** — `/settings/integrations` webhook delivery log  

## Local reseed

```bash
# After supabase start + migrations
npm run db:seed          # local profile
npm run db:seed:demo     # same dense data as preview
```

Auth users are provisioned when `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` are set (local Supabase from `supabase status`).
