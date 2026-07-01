# R0 Closeout Plan - Release-Completeness Gaps  *(Release R0 / Module M0)*

> R0 is functionally complete as the secure MVP1 backend/API platform. This closeout plan covers
> the remaining release-hygiene gaps found during the July 1, 2026 release-plan review: places
> where the docs claim broader scaffolding or synchronized context than the repo currently proves.

## Goal

Make the R0 completion claim mechanically defensible: docs match shipped artifacts, shared
assistant context is synchronized, and the R0 validation command set is clear.

## Gaps

1. **Phase 0 tooling claims are broader than current artifacts.**
   `0-engineering-foundations.md` says pgTAP, axe, and k6 scaffolding are wired. The repo has
   Vitest unit/integration/RLS projects, Playwright, and coverage thresholds, but no pgTAP/k6
   harness files and no first-class axe Playwright helper.
2. **Shared assistant memory is out of sync.**
   `AGENTS.md` has the current module/release organization, but `.github/copilot-instructions.md`
   still describes phased delivery and lacks the R0-R7 release map.
3. **R0 completion evidence should be captured once.**
   The implementation evidence is spread across migrations, API routes, tests, `vercel.json`,
   and OpenAPI. A short closeout note should state what command set proves R0 and which optional
   tooling is deferred to R7 hardening.

## Work Items

### PR R0-C1 - Reconcile Phase 0 tooling language

- Decide whether pgTAP and k6 are required before calling R0 complete.
- Recommended: update `0-engineering-foundations.md` to say R0 uses Vitest-backed raw-SQL RLS
  tests instead of pgTAP, and defers k6 load scripts to R7 platform hardening.
- Add a small `@axe-core/playwright` helper only when R1 UI work starts, or explicitly mark axe as
  a UI-phase gate rather than an R0 artifact.

**Exit check:** no R0 doc claims a test harness that does not exist in the repo.

### PR R0-C2 - Synchronize assistant-memory files

- Copy the module/release delivery organization from `AGENTS.md` into
  `.github/copilot-instructions.md`.
- Keep the Phase 0-4 status blocks equivalent, including migration names and release references.

**Exit check:** the project-status sections agree on R0 complete, R1-R7 sequencing, and the
canonical `docs/module-delivery-plan.md` reference.

### PR R0-C3 - Add an R0 validation note

- Add a short `docs/releases/r0-platform-foundation/R0_VALIDATION.md` or appendix to this file
  listing the validation commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test:rls`
  - `npm run test:e2e`
  - `npm run api-docs:ci`
- Note that DB-backed suites require the Prisma migrations followed by Supabase SQL migrations,
  matching CI.
- Include the key evidence paths: Phase 1-4 Prisma migrations, Phase 1-4 Supabase SQL migrations,
  `tests/rls/**`, `tests/integration/api/phase3-*`, `tests/integration/api/phase4-*`,
  `app/api/**`, `docs/openapi.yaml`, and `vercel.json`.

**Exit check:** a reviewer can verify R0 without reconstructing the evidence from multiple docs.

## Completion Criteria

R0 should remain marked complete when all three closeout PRs land. If the team instead chooses to
require pgTAP/k6 before R0 completion, add those harnesses in PR R0-C1 and keep the same exit
checks.
