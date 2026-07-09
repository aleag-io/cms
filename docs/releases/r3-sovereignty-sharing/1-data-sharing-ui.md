# Phase 12 Implementation Plan — Data-Sharing Governance & Contextual Sharing UI (MVP2)  *(Release R3 · Module M4)*

> **Release R3 — Sovereignty & Sharing · Module M4 (UI).** Canonical map:
> [module-delivery-plan.md](../../module-delivery-plan.md) §5. Implementation detail for Phase 12. The
> parish-data-sovereignty control surface — the diocese and parish sides of the sharing
> lifecycle, emergency access, and universal contextual sharing including the secure-link viewer.
> The MVP1 sovereignty model (Phase 4) has **no UI today**; this phase adds it. Depends on
> Phases 6 (diocese) and 7 (parish).

**Phase goal:** request → approve → grant → revoke lifecycle UI, emergency access, contextual
shares (user/role/secure-link) with anonymized preview, and the public secure-link viewer.

---

## 1. APIs consumed

`/api/sharing/requests` · `/[id]` · `/api/sharing/grants` · `/[id]` · `/api/sharing/emergency` ·
`/[id]` · `/api/shares` · `/[id]` · `/[id]/view` · `/api/shares/link/[token]` ·
`/api/diocese/aggregate` (revocation reflection).

## 2. Work breakdown (PRs)

- **PR 12-1 — Sharing requests.** Diocese Admin creates (`/api/sharing/requests`); Parish Admin /
  Data Sharing Manager approve/reject with scope + expiry (`/[id]`); request history + status.
- **PR 12-2 — Grants.** Create/scope/expiry/**revoke** (`/api/sharing/grants`, `/[id]`) with an
  immediate-revoke confirmation; active-grant list per parish.
- **PR 12-3 — Emergency access.** Invoke (≤7 days, justification, view-only), list, expiry
  (`/api/sharing/emergency`, `/[id]`).
- **PR 12-4 — Contextual share menu.** Page-level "Share" affordance → `user_share` /
  `role_share` / `secure_link` (`/api/shares`) with expiry, max-views, and anonymized-projection
  preview; manage/revoke existing shares.
- **PR 12-5 — Secure-link viewer.** Public, token-gated, read-only, anonymized page
  (`/api/shares/link/[token]`, `/[id]/view`) that denies on expired/exhausted/revoked.
- **PR 12-6 — Exit-gate tests** (`@mvp2 @phase:12`).

## 3. Tests

- **Integration (centerpiece lifecycle):** Diocese requests → Parish approves → grant issued →
  Parish revokes + audit trail; reject path; emergency create/revoke + 7-day cap; secure link
  denies when exhausted/expired/revoked; tokens never logged or returned as `tokenHash`;
  concurrent maxViews consume. Suite: `tests/integration/api/phase4-sharing.test.ts`.
- **E2E (console / role smoke):** unauthenticated `/sharing` → login; secure-link unavailable +
  axe; parish admin console tabs + create secure link (one-time token UI); console axe; member
  and staff role gates. Suite: `tests/e2e/r3-sharing.test.ts`. Multi-actor UI journey is
  intentionally covered at integration (shared seeded DB + multi-session Playwright cost).
- **Unit:** token hash/verify; anonymize strips PII; `shareLifecycleStatus`; `publicShare`
  strips `tokenHash` (`tests/unit/lib/sharing*.test.ts`).
- **a11y:** axe on sharing console + secure-link unavailable viewer.

## 4. Exit gate

1. Revocation is audited and grant becomes inactive immediately (integration); UI shows revoked /
   inactive grants on next load of the sharing console.
2. Secure links never expose raw identifiers; anonymized projection strips PII; tokens never
   returned/logged in plaintext (`tokenHash` stripped on all share responses).
3. Emergency access is view-only, time-boxed (≤7 days), and audited.

## 5. Shipped state (2026-07-09)

- Surfaces: `/sharing`, `/share/[token]`, `/shares/[id]`; panels for requests, grants, emergency,
  contextual shares.
- Hardening: atomic view consume, hard API error surfacing, lifecycle badges, parish name
  fallback, diocese work-context for share manage.
- **Deferred:** shell-wide page-level Share menu (features.md global UX rule); richer M3 diocese
  dashboards beyond Tier-2 aggregate (→ R6).
