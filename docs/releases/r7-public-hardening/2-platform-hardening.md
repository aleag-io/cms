# Platform Hardening: Performance, Security, Accessibility, DR  *(Release R7 · Module M14)*

> **Release R7 — Public & Hardening · Module M14 (platform NFR).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Companion to the public-pages
> work item ([1-public-pages-ux-hardening.md](1-public-pages-ux-hardening.md), Modules M13/M14 UI
> polish). This item is the **platform-wide** performance/security/DR bar; its patterns apply
> continuously as each release lands, with a dedicated pass here at the end.

**Goal:** meet the non-functional bar for production.

**Requirements covered:** PE-1–12, SE-1/2/5/7/8, AV-1–4, UX-1–15, SC-1–3, AU resilience.

---

## Deliverables

- Performance: indexes per architecture §9.3, pagination everywhere (PE-7), tsvector member
  search (PE-11), aggregate query budget (PE-12), bundle/code-split budget (PE-10),
  `next/image` for photos (PE-9), caching/ISR for reference data (PE-8).
- Security: full RLS hardening pass + external/security-review skill run; audit-tamper alerting
  (SE-7); secret redaction in audit payloads (SE-8); TLS/at-rest confirmation.
- Accessibility: WCAG 2.1 AA audit closure (UX-2/10/11) via axe + manual keyboard pass.
- Reliability: backup/restore + **DR drill** (AV-2/3); audit pipeline resilience/lag alerting (AV-4).
- UX polish: skeletons, optimistic UI, empty states, toasts, confirmation dialogs (UX-4–9),
  role-aware nav (UX-12).

## Tests written this release

- **k6 load tests** asserting p95 budgets: API ≤500 ms (PE-5), DB queries ≤200 ms (PE-6), search
  ≤1 s at 100k rows (PE-11), diocese aggregate ≤3 s over 200 parishes (PE-12).
- Bundle-size CI check (no route chunk >200 KB gzipped, PE-10).
- axe accessibility assertions on all key screens; keyboard-only E2E path.
- A restore-from-backup drill validated against the seeded dataset; audit-tamper attempt raises
  an alert + immutable entry (SE-7).

## Validation gate (release)

- All p95 performance budgets met under load test.
- Security review findings triaged to zero criticals; RLS hardening pass signed off.
- WCAG AA automated + manual checks pass on key flows.
- DR drill completes within RPO; audit resilience alerting verified.
