# Branching & Deployment Workflow

> Canonical since 2026-07-15. `preview` is the **integration/QA branch** (staging);
> `main` is **production**. Supersedes the earlier "preview mirrors main" model.

## The flow

```
feature/x ──PR──▶ preview  (QA/UAT on preview.cms.aleag.io)  ──release PR──▶ main (prod)
```

| Branch | Role | Deploys to | Database |
| --- | --- | --- | --- |
| `feature/*` | one change | per-PR Vercel URL | **same** persistent Supabase branch `fnvayegctruotqnutswv` (shared; per-PR ephemeral branching disabled — concurrent branch quota; see `docs/ops/environments-and-domains.md` §6) |
| `preview` | integration / staging / QA | `preview.cms.aleag.io` | persistent Supabase branch `fnvayegctruotqnutswv` |
| `main` | production | `cms.aleag.io` | prod project `nehywddvywocalnhuqig` |

## Feature work

1. Branch off `preview`: `git switch -c feature/x origin/preview`.
2. Develop locally (`supabase start`; `npm run db:migrate` after authoring migrations).
3. **If you added any migration** (Prisma or `supabase/migrations/*.sql`):
   `npm run db:branch:generate` and commit the regenerated `supabase-branch/`
   bundle — CI (`db:branch:check`) fails the PR otherwise.
4. Open a **PR → `preview`** (`gh pr create --base preview`). Test in isolation on
   the auto-created per-PR environment.
5. Review + green CI → **squash-merge to `preview`**. It auto-deploys to
   `preview.cms.aleag.io`; the Supabase integration applies new migrations from
   `supabase-branch/supabase/migrations` to the persistent preview DB — this is
   the **migration dress rehearsal** before prod.

## QA / UAT on preview

- Test users work on `preview.cms.aleag.io` (seeded login in
  `supabase-branch/supabase/seed.sql`: `preview.admin@example.invalid` /
  `Preview@Local1`).
- Multiple in-flight features are exercised **together** here before prod.
- Check `https://preview.cms.aleag.io/api/health` — must show project ref
  `fnvayegctruotqnutswv` and `consistent: true`. If it shows the prod ref, the
  env overrides are broken (see §Environment wiring).

## Releasing to production

1. When QA signs off, open a **release PR `preview → main`**
   (`gh pr create --base main --head preview`).
2. Merging it (use a **merge commit**, not squash, so the branches stay
   convergent) deploys production: the Vercel build runs `db:migrate:all`
   against the prod DB — the same migrations already rehearsed on preview.
3. Verify `https://cms.aleag.io/api/health`.

## Hotfixes

1. Branch off `main` → PR → `main` (emergency path, skips the preview soak).
2. Immediately merge `main` back into `preview` (PR `main → preview`) so the
   branches reconverge.

## Rules

- **Nothing lands on `preview` or `main` except via PR.** No direct pushes, no
  force-pushes (the old mirror-style resets are retired).
- **Release PRs `preview → main` use a merge commit; feature PRs squash.**
- **Migration timestamps must stay ordered.** A migration authored after one
  already on `preview` must carry a later timestamp (rebase + rename if needed).
- **Abandoning a feature whose migrations already ran on preview** requires
  resetting the preview Supabase branch DB (Dashboard → Branches → reset; it
  reseeds — data on preview is disposable).
- Never hand-edit `supabase-branch/` — it is generated.
- Never merge the release PR with unresolved red CI; the prod migration run is
  the same code path CI just validated.

## Environment wiring (why preview isn't on the prod DB)

The Vercel↔Supabase integration injects the **production** project's credentials
as locked "All Environments" variables that outrank branch-scoped project vars.
The app therefore resolves `*_OVERRIDE` names first (`lib/supabase/env.ts`):
`NEXT_PUBLIC_SUPABASE_URL_OVERRIDE`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_OVERRIDE`,
`SUPABASE_SERVICE_ROLE_KEY_OVERRIDE` — plus `DATABASE_URL` for Postgres (the app
reads `DATABASE_URL ?? POSTGRES_URL`; the integration only sets the latter).
These four are set in Vercel for **all Preview** deployments (no git-branch
restriction), pointing at the persistent Supabase `preview` branch so feature
PRs and `preview.cms.aleag.io` share that DB and never hit prod. Git-branch
scoped duplicates for `preview` may still exist; either works. Refresh them if
the Supabase `preview` branch is recreated:
`supabase --experimental branches get preview -o env`, then re-add via
`vercel env add <name> preview --force` (Preview environment, all branches).

Also: the Supabase store connection must **not** require `branch-project`
actions on Preview (`deployments.required = false`); otherwise Vercel aborts
with "Resource provisioning failed" when the concurrent branch quota is full.

Production is untouched by all of this: overrides are unset there, so the
integration's variables apply.
