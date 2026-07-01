# Phase 13 Implementation Plan — Public/Guest Pages + MVP2 UX Hardening  *(Release R7 · Modules M13, M14)*

> **Release R7 — Public & Hardening · Modules M13, M14 (with Phase 22).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 13. The unauthenticated
> surface and the closing quality pass that makes **MVP2** shippable. Depends on all prior MVP2
> phases.

**Phase goal:** guest/public parish pages, the cross-MVP2 UX polish pass, WCAG 2.1 AA closure,
and the per-persona E2E acceptance suite that gates the MVP2 release.

---

## 1. Work breakdown (PRs)

- **PR 13-1 — Guest/public pages.** Per-parish (if enabled): public profile (address, contact,
  Mass schedule), public events calendar, contact form, online-giving entry stub, self-registration
  CTA. Unauthenticated — exposes only public data.
- **PR 13-2 — UX polish pass.** Skeletons, optimistic UI, empty states, toasts, confirmation
  dialogs, role-aware nav finalization, responsive/mobile for all management tables, print
  stylesheet for exports/statements.
- **PR 13-3 — Accessibility closure.** WCAG 2.1 AA audit (axe + manual keyboard pass) on all key
  screens; fix findings to zero criticals.
- **PR 13-4 — Per-persona E2E suite.** A full journey per role (Diocese Admin, Parish Admin,
  Parish Staff, Ministry/Org Leader, Clergy, Member, Guest) as the MVP2 acceptance suite
  (`@mvp2 @acceptance`).
- **PR 13-5 — MVP2 sensitive-field-leak sweep.** One suite runs the Phase 8/9/12 no-leak
  assertions across **all** rendered surfaces + exports + shares.

## 2. Tests

- axe on every key screen; keyboard-only E2E path.
- Per-persona E2E green in CI.
- Responsive checks at mobile/tablet/desktop for management tables.
- Guest E2E: unauthenticated user sees only public data.

## 3. Exit gate (MVP2 release)

1. WCAG AA automated + manual checks pass on key flows.
2. Every persona completes its primary journey end-to-end in CI.
3. No sensitive-field leak across any rendered surface (single sweep suite passes).
4. Guest surface exposes only public data (proven by E2E).

## 4. AGENTS.md update (on MVP2 completion)

Mark **MVP2 (Phases 5–13) — complete**: the full UI over the MVP1 API surface for diocese,
parish, family, member management, operations, sharing governance, and public pages, hardened
to WCAG AA with a per-persona acceptance suite. Next: **MVP3 — Finance Core (Phase 20)**.
