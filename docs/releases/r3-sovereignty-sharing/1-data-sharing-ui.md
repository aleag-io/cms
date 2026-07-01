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

- **E2E (centerpiece):** Diocese requests → Parish approves → Diocese reads shared category →
  Parish revokes → Diocese sees "no longer available" on next load. Secure link denies when
  expired/exhausted/revoked.
- **Integration:** every lifecycle action writes the audit entries from access-control §7; the
  contextual-share preview shows the anonymized projection (no direct identifiers / private notes).
- **Unit:** share-scope/expiry validation; token-state → viewer-state mapping.
- **a11y:** axe on sharing console + secure-link viewer.

## 4. Exit gate

1. Revocation reflects immediately in the diocese UI (no stale shared data).
2. Secure links never expose raw identifiers; anonymized preview matches recipient view; tokens
   never rendered/logged in plaintext.
3. Emergency access is view-only, time-boxed, and audited.
