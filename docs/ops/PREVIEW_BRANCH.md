# `preview` branch — persistent staging environment

This branch backs `preview.cms.aleag.io` and is intentionally kept slightly
distinct from `main` so it can hold an **open (never-merged) PR to `main`**.

Why the open PR: the Supabase↔Vercel integration only maps a Git branch to its
own Supabase branch database (instead of the production project) **while a pull
request for that branch is open**. Without the PR, preview deployments fall back
to the production Supabase project. Do **not** merge that PR — it exists solely
to hold the branch→branch-DB mapping.

Sync policy: `preview` mirrors `main`'s content plus this marker. To refresh,
reset `preview` to `main` and re-apply this file.
