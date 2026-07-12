# Batch Donation Entry + Giving Categories — Design

> Status: approved design (2026-07-12). Release: extends R5 Finance & Giving (M10).
> Scope: **this spec** delivers giving categories + batch donation entry. The annual
> **Receipts & Payments PDF** is an explicit follow-on (next release) whose data needs are
> satisfied by the model here.

## 1. Problem

The parish/diocese accountant needs to record giving quickly and in **batches** — a Sunday's
envelopes plus loose plate cash — from **members and non-members**, tagged by **purpose**
(Subscription, Birthday Offertory, plate Offertory, Christmas Donation, Special Donation, …).
Today the UI records **one donation at a time, family-only**, and each donation posts its own
journal entry. That is slow, cannot capture non-members or anonymous plate cash cleanly, and
does not reconcile to a single bank deposit.

Grounding: the real `Trinity Mar Thoma Church` 2024 annual report is a **cash-basis Receipts &
Payments statement** where each giving purpose is a **line item** grouped under a **fund/section**
(B. Church Operation, C. Diocese, D. Mission, F. Humanitarian, G. Jubilee), with
Budget/Actual/Variance columns. The data model below is shaped so that report can be generated
directly later.

## 2. Goals / non-goals

**Goals**
- A configurable **GivingCategory** taxonomy (purpose → income account + fund/section).
- **Batch entry**: fast grid to record many gifts (member / non-member / anonymous plate) with a
  running total, then post the whole batch.
- **One consolidated deposit journal per batch** = the batch total, matching a single bank-deposit
  line (chosen posting model).
- Non-members via **ExternalDonor**; anonymous **plate/loose cash** as an anonymous line.
- Preserve PA-22: member statements still include only `memberId`-attributed gifts.

**Non-goals (this spec)**
- Annual Receipts & Payments **PDF** generation — next release (reuses this model + the existing
  Budget module for Budget/Actual/Variance).
- Undeposited-Funds two-step deposit workflow (may add later; chart already has the account).
- Editing a **posted** batch (correct via a reversing entry, consistent with ledger immutability).
- Per-donation journal posting for batches (single "Record donation" one-offs keep their existing
  immediate-journal behavior).

## 3. Data model

### 3.1 New: `GivingCategory`
Scoped to a ledger owner like `Fund`/`Account` (`ownerType`/`ownerId` + `dioceseId`/`parishId`).

| field | notes |
| --- | --- |
| `id` | uuid |
| `dioceseId`, `parishId?`, `ownerType`, `ownerId` | ledger-owner scope (PARISH or DIOCESE) |
| `name` | e.g. "Subscription", "Offertory (Plate)", "Birthday Offertory" |
| `section` | report head, e.g. "Church Operation", "Diocese Collections", "Mission Fund", "Humanitarian Fund", "Jubilee" |
| `sortOrder` | int, ordering within section |
| `fundId?` | fund the category belongs to (the report section's fund) |
| `incomeAccountId` | the INCOME account credited when a gift in this category posts |
| `isTaxDeductible` | bool, default true (statement/report hint) |
| `countsToStatement` | bool, default true — appears on donor giving statements |
| `isActive` | bool, default true |

Constraints: `@@unique([ownerType, ownerId, name])`; indexes on `(dioceseId, ownerType, ownerId, section, sortOrder)`.

### 3.2 `Donation` — add `categoryId`
- Add nullable `categoryId` FK → `GivingCategory` (`onDelete: SetNull`).
- The category determines the income account credited at posting. `fundId` remains (defaulted from
  the category's fund) for continuity with existing reporting/aggregate.

### 3.3 `DonationBatch` — reuse, add deposit account
Already has `ownerType/ownerId`, `batchDate`, `label`, `status (OPEN|POSTED|VOID)`, `totalCents`,
`donationCount`, `depositReference`, `postedJournalEntryId`. Add nullable `depositAccountId`
(the cash/ASSET account debited on post). New source enum value already exists: `BATCH_ADJUSTMENT`
is unrelated; batch deposit journals use `source = 'DONATION'`.

Batch lifecycle:
- **OPEN** — donations may be added/removed; no journal yet.
- **POSTED** — consolidated journal created; batch + its donations are locked (edits via reversal).
- **VOID** — (future) not in this spec.

### 3.4 `ExternalDonor` — reuse, add CRUD
Existing model (name, email, phone, address, linkedFamilyId). This spec adds the API/UI to
create + pick external donors during batch entry.

## 4. Posting model (chosen: one deposit per batch)

Donations added to an **OPEN** batch are created **without** individual journal entries
(`journalEntryId = null`, `batchId = batch`). Posting the batch:

1. Validate the batch is OPEN and has ≥1 active donation; resolve `depositAccountId` (ASSET) and the
   covering **open period** for `batchDate`.
2. Group donations by `category.incomeAccountId`; compute a credit subtotal per income account.
3. Build **one** balanced `JournalEntry` (`source = 'DONATION'`, `cashImpact = true`):
   - `DEBIT depositAccount` = batch total;
   - `CREDIT` each income account = its category subtotal.
   Every batch donation line **requires a category** (the grid preselects a default active category
   so entry stays fast); posting rejects a batch with an uncategorized line rather than guessing an
   account.
4. Post it through the existing `postJournalEntry` engine (DRAFT→POSTED; system source, exempt from
   the maker-checker gate — donations are not maker-checked, consistent with the existing donation
   flow).
5. Set `batch.postedJournalEntryId`, `batch.status = 'POSTED'`, `batch.totalCents`,
   `batch.donationCount`; set each donation's `journalEntryId` to the consolidated entry.
6. Audit `finance.donationbatch.post` (batch summary) and keep per-donation `finance.donation.create`
   at add-time.

Reconciliation: the single debit to the deposit account equals one bank-statement deposit line, so
existing bank reconciliation matches on one row.

## 5. Anonymous plate & non-members

- **Plate / loose cash** = a donation with `isAnonymous = true`, no `familyId`/`memberId`/
  `externalDonorId`, `method = 'CASH'`, category "Offertory (Plate)". One row per service is typical.
- **Non-members** = pick an existing `ExternalDonor` or type a name to create one inline
  (`externalDonorId` set). Never appears on member statements.
- PA-22 unchanged: member giving statements filter `memberId = <member>`; batch/category features do
  not allocate family or anonymous gifts to members.

## 6. API surface (all through `withTenant`, audited, RLS-gated)

- `GET/POST /api/finance/giving-categories`, `PATCH /api/finance/giving-categories/[id]` — manage
  categories (admin: parish_admin / diocese_admin / staff).
- `GET/POST /api/finance/external-donors`, `PATCH /api/finance/external-donors/[id]`.
- `GET/POST /api/finance/donation-batches` — list / create OPEN batch.
- `GET /api/finance/donation-batches/[id]` — batch + its donations.
- `POST /api/finance/donation-batches/[id]/donations` — add a gift (bulk-capable: accept an array).
- `DELETE /api/finance/donation-batches/[id]/donations/[donationId]` — remove from OPEN batch.
- `POST /api/finance/donation-batches/[id]/post` — body `{ depositAccountId }` → consolidated deposit.

## 7. UI surface

- **`/finance/batches`** (new): list of batches (date, label, total, status); "New batch".
- **New-batch grid**: header (date, label, deposit reference, deposit account); rows =
  Donor picker (member/family search · "non-member" · "Anonymous / Plate") · Amount ·
  Category · Method · check#. Enter adds a row; running **total** always visible; "Post batch".
- **Categories admin**: `/finance/giving-categories` (or a tab on donations) — add/edit/reorder,
  map to fund + income account.
- The existing single **Record donation** form gains the Category picker and a non-member/anonymous
  donor option; it remains the quick one-off path.
- Nav: add "Batches" (and categories under settings/admin) in the Finance section, parish + diocese
  portals.

## 8. Migration & RLS

- **Prisma migration**: create `GivingCategory`; add `Donation.categoryId` (+ relation);
  add `DonationBatch.depositAccountId`.
- **Supabase RLS**: enable + force RLS on `GivingCategory`; grant SELECT/INSERT/UPDATE to
  `app_authenticated`; policy `givingcategory_ledger_rw` using
  `finance_can_read_ledger` / `finance_can_write_ledger` (owner-scoped, mirrors `Fund`/`Account`).
  `DonationBatch` already has its `*_ledger_rw` policy. No change to `Donation` policies.

## 9. Seed

Seed a default `GivingCategory` set per the reference report, mapped to seeded income accounts +
funds/sections, for both a demo parish and the diocese ledger. Examples:
- **Church Operation** (General Fund): Subscription, Offertory (Plate), Birthday Offertory,
  Christmas Donation, Special Donation, Wedding Anniversary Offertory, Baptism & Marriage Offertory,
  One Day Income, Student Sunday Offertory, Social Hours.
- **Diocese Collections**: Diocesan Sunday Offertory, Diocesan Sunday Donation, Suvisesha Nidhi.
- **Mission Fund**: Harvest (Donation/Auction), Parish Day Offertory, Mission Special Donation.
- **HQ Tiruvalla**: Good Friday Offertory, Palm Sunday Offertory, Self Denial, Marriage Aid.
- **Humanitarian**: Light to Life / Endowment.
- **Jubilee**: Golden Jubilee Income.

Expand the default chart (`lib/finance/seedChart.ts`) with the income accounts these categories need.

## 10. Testing

- **Integration** (`tests/integration/api/r5-donation-batches.test.ts`): create OPEN batch; add a
  member gift, an external-donor gift, and an anonymous plate gift across two categories; post →
  exactly **one** balanced `JournalEntry` whose credit lines equal the per-category subtotals and
  whose debit equals the batch total; batch → POSTED, donations linked to that entry; posting an
  already-posted batch rejected.
- **PA-22**: a member statement over batch-entered gifts still includes only that member's gifts
  (extend statements test).
- **RLS** (`tests/rls/r5-giving-categories.test.ts`): category + batch owner isolation.
- **Unit**: category-subtotal grouping helper (pure).

## 11. How this feeds the annual report (next release)

- Report **line items** = `GivingCategory`; **groups/heads** = `section`/`fund`; **Actual** = posted
  income by category; **Budget** = the existing `Budget`/`BudgetLine` per income account; **Variance**
  = Budget − Actual. The Receipts & Payments PDF (via `@react-pdf/renderer`, already a dependency)
  becomes a grouped query + render — no data rework.
