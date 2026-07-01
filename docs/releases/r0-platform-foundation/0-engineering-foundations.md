# Engineering Foundations & Test Harness  *(Release R0 · Module M0)*

> **Release R0 — Platform Foundation · Module M0 (engineering foundations).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. This is the first work item of R0
> — it stands up the environments and test gates every later release assumes. **Status: complete.**

**Goal:** make it impossible to merge untested code, and stand up the environments the later
releases assume.

---

## Deliverables

- Test runners wired: Vitest (unit + integration), Playwright (E2E), pgTAP harness for RLS,
  axe + k6 scaffolding.
- Supabase local stack reproducible; ephemeral test DB spun up per CI run; deterministic
  seed/fixtures script.
- GitHub Actions pipeline: `typecheck → lint → unit → integration → rls → e2e-smoke`, with
  coverage threshold and required-status-check on `main`.
- Decide and document the Prisma ↔ Supabase migration story (Prisma for schema, Supabase SQL
  migrations for RLS policies/triggers/views) so they coexist cleanly.
- Replace the placeholder cookie auth seam with an injectable session interface so the identity
  work (R0 item 1) can drop in Supabase Auth without rewriting callers.

## Tests written this item

- A trivial unit test, an integration test that hits one existing route against the test DB, one
  RLS smoke test, and one Playwright smoke test — all green in CI. This proves every layer of the
  test pyramid actually runs before features arrive.

## Validation gate (exit)

- A PR that drops below the coverage threshold or breaks any suite is **blocked by CI**.
- `make`/npm scripts run the full suite locally in one command.
- Seeded fixture DB is identical across local and CI.

> The full test pyramid, RLS-testing rationale, and the Definition of Done that every work item
> follows live in [module-delivery-plan.md](../../module-delivery-plan.md) §8.
