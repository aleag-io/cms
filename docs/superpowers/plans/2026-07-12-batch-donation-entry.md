# Batch Donation Entry + Giving Categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parish/diocese accountant record giving in fast **batches** (members, non-members, anonymous plate) tagged by a configurable **GivingCategory**, posting one **consolidated deposit** journal per batch.

**Architecture:** Extends R5 Finance (M10). New `GivingCategory` model (purpose → income account + fund/section) scoped to a ledger owner like `Fund`/`Account`. Donations are added to an `OPEN` `DonationBatch` with no per-gift journal; posting the batch groups gifts by category income account and writes ONE balanced `JournalEntry` (debit deposit cash, credit each income account by subtotal) through the existing `postJournalEntry` engine, then locks the batch. RLS reuses `finance_can_read_ledger`/`finance_can_write_ledger`.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres RLS (Supabase), React 19 + @tanstack/react-query, Vitest (unit/integration/rls), Playwright (e2e).

## Global Constraints

- Money is `BigInt` integer cents; serialize with `centsToJson`/`centsFromJson` (`lib/finance/money.ts`). Never `Float`.
- All tenant reads/writes go through `withTenant(claims, tx => …)` — never bare `prisma` (except seeds/webhooks).
- Every create/update is audited via `writeAuditEntry` (`lib/audit.ts`); action strings `finance.*`.
- API routes: `export const GET/POST/PATCH = (req) => handle(async () => { const actor = await requireRole([...]); const claims = await claimsFromUser(actor); … })`. Validation throws `ApiError(400, …)`.
- Ledger owner resolved via `parseOwnerQuery(raw, claims)` + `resolveOrgLedgerParishId` for orgs (`lib/finance/ledger-scope.ts`, `lib/finance/resolve-org.ts`).
- PA-22 invariant unchanged: member giving statements include only `memberId`-attributed gifts.
- Prisma migration timestamp: `20260712000001_r5_giving_categories`. Supabase RLS file: `supabase/migrations/20260712000002_r5_giving_categories_rls.sql`.
- Tests: `npm run test:unit` · `test:integration` · `test:rls`. Integration/RLS use `tests/helpers/db.ts` (FX fixtures) + `tests/helpers/auth.ts` (`asUser`) / `tests/helpers/rls.ts` (`makeClaims`, `withTenantSession`).

---

## File Structure

**Create**
- `prisma/migrations/20260712000001_r5_giving_categories/migration.sql` — GivingCategory table, Donation.categoryId, DonationBatch.depositAccountId.
- `supabase/migrations/20260712000002_r5_giving_categories_rls.sql` — RLS grants + policy for GivingCategory.
- `lib/finance/batch.ts` — pure category-subtotal grouping + batch-post orchestration helper.
- `app/api/finance/giving-categories/route.ts` (GET/POST) + `app/api/finance/giving-categories/[id]/route.ts` (PATCH).
- `app/api/finance/external-donors/route.ts` (GET/POST) + `app/api/finance/external-donors/[id]/route.ts` (PATCH).
- `app/api/finance/donation-batches/route.ts` (GET/POST) + `[id]/route.ts` (GET) + `[id]/donations/route.ts` (POST) + `[id]/donations/[donationId]/route.ts` (DELETE) + `[id]/post/route.ts` (POST).
- `app/(app)/finance/batches/page.tsx` — batch list.
- `app/(app)/finance/batches/[id]/page.tsx` — new/edit batch grid + post.
- `app/(app)/finance/giving-categories/page.tsx` — category admin.
- `components/finance/donor-picker.tsx` — member/family/external/anonymous picker.
- `tests/unit/finance/batch.test.ts`, `tests/integration/api/r5-donation-batches.test.ts`, `tests/rls/r5-giving-categories.test.ts`.

**Modify**
- `prisma/schema.prisma` — GivingCategory model, Donation.categoryId + relation, DonationBatch.depositAccountId + relation, back-relations on Fund/Account/Parish/Diocese.
- `lib/finance/validate.ts` — `parseGivingCategory`, `parseBatchDonationLine`.
- `lib/finance/seedChart.ts` — extra income accounts for default categories.
- `prisma/seed-finance.ts` — seed default GivingCategory rows.
- `lib/nav/menu.ts` — "Batches" + "Giving Categories" nav items (parish + diocese portals).
- `app/(app)/finance/donations/page.tsx` — add Category picker + non-member/anonymous to the single Record-donation form.
- `tests/helpers/db.ts` — add `GivingCategory` to the TRUNCATE list.
- `tests/unit/lib/nav-menu.test.ts` — update expected nav lists.

---

## Task 1: Schema — GivingCategory, Donation.categoryId, DonationBatch.depositAccountId

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712000001_r5_giving_categories/migration.sql`
- Modify: `tests/helpers/db.ts` (TRUNCATE list)

**Interfaces:**
- Produces: `GivingCategory { id, dioceseId, parishId?, ownerType, ownerId, name, section, sortOrder, fundId?, incomeAccountId, isTaxDeductible, countsToStatement, isActive }`; `Donation.categoryId?`; `DonationBatch.depositAccountId?`.

- [ ] **Step 1: Add the Prisma model + fields.** In `prisma/schema.prisma` add:

```prisma
model GivingCategory {
  id              String          @id @default(uuid()) @db.Uuid
  dioceseId       String          @db.Uuid
  parishId        String?         @db.Uuid
  ownerType       LedgerOwnerType
  ownerId         String          @db.Uuid
  name            String
  section         String
  sortOrder       Int             @default(0)
  fundId          String?         @db.Uuid
  incomeAccountId String          @db.Uuid
  isTaxDeductible Boolean         @default(true)
  countsToStatement Boolean       @default(true)
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  diocese         Diocese         @relation(fields: [dioceseId], references: [id], onDelete: Cascade)
  parish          Parish?         @relation(fields: [parishId], references: [id], onDelete: Cascade)
  fund            Fund?           @relation(fields: [fundId], references: [id], onDelete: SetNull)
  incomeAccount   Account         @relation("GivingCategoryIncomeAccount", fields: [incomeAccountId], references: [id], onDelete: Restrict)
  donations       Donation[]

  @@unique([ownerType, ownerId, name])
  @@index([dioceseId, ownerType, ownerId, section, sortOrder])
  @@index([parishId, ownerType, ownerId])
}
```

Add to `Donation`: `categoryId String? @db.Uuid` and `category GivingCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)` and `@@index([categoryId])`.
Add to `DonationBatch`: `depositAccountId String? @db.Uuid` and `depositAccount Account? @relation("DonationBatchDepositAccount", fields: [depositAccountId], references: [id], onDelete: SetNull)`.
Add back-relations: on `Diocese` → `givingCategories GivingCategory[]`; on `Parish` → `givingCategories GivingCategory[]`; on `Fund` → `givingCategories GivingCategory[]`; on `Account` → `givingCategories GivingCategory[] @relation("GivingCategoryIncomeAccount")` and `depositBatches DonationBatch[] @relation("DonationBatchDepositAccount")`.

- [ ] **Step 2: Write the migration SQL.** Create `prisma/migrations/20260712000001_r5_giving_categories/migration.sql`:

```sql
CREATE TABLE "GivingCategory" (
  "id" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "parishId" UUID,
  "ownerType" "LedgerOwnerType" NOT NULL,
  "ownerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "fundId" UUID,
  "incomeAccountId" UUID NOT NULL,
  "isTaxDeductible" BOOLEAN NOT NULL DEFAULT true,
  "countsToStatement" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GivingCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GivingCategory_owner_name_key" ON "GivingCategory"("ownerType","ownerId","name");
CREATE INDEX "GivingCategory_scope_section_idx" ON "GivingCategory"("dioceseId","ownerType","ownerId","section","sortOrder");
CREATE INDEX "GivingCategory_parish_owner_idx" ON "GivingCategory"("parishId","ownerType","ownerId");
ALTER TABLE "GivingCategory" ADD CONSTRAINT "GivingCategory_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingCategory" ADD CONSTRAINT "GivingCategory_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingCategory" ADD CONSTRAINT "GivingCategory_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GivingCategory" ADD CONSTRAINT "GivingCategory_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Donation" ADD COLUMN "categoryId" UUID;
CREATE INDEX "Donation_categoryId_idx" ON "Donation"("categoryId");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GivingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DonationBatch" ADD COLUMN "depositAccountId" UUID;
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_depositAccountId_fkey" FOREIGN KEY ("depositAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Add `GivingCategory` to the test TRUNCATE list.** In `tests/helpers/db.ts` `resetTestDb`, add `"GivingCategory"` to the TRUNCATE statement (before `"Donation"` so FK order is fine — CASCADE handles it, but list it near the other finance tables, e.g. right after `"DonationAllocation",`).

- [ ] **Step 4: Apply + generate.** Run: `npm run db:migrate:all && npx prisma generate`
  Expected: migration applies, client regenerates, no errors.

- [ ] **Step 5: Typecheck.** Run: `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations/20260712000001_r5_giving_categories tests/helpers/db.ts
git commit -m "feat(finance): GivingCategory schema + Donation.categoryId + batch deposit account"
```

---

## Task 2: RLS for GivingCategory

**Files:**
- Create: `supabase/migrations/20260712000002_r5_giving_categories_rls.sql`

**Interfaces:**
- Consumes: `finance_can_read_ledger`, `finance_can_write_ledger` (from `20260711000002_r5_finance_rls.sql`).

- [ ] **Step 1: Write the RLS migration** (idempotent, mirrors the `*_ledger_rw` pattern):

```sql
-- R5 / M10 — GivingCategory RLS (owner-scoped like Fund/Account)
GRANT SELECT, INSERT, UPDATE ON "GivingCategory" TO app_authenticated;
ALTER TABLE "GivingCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GivingCategory" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS givingcategory_ledger_rw ON "GivingCategory";
CREATE POLICY givingcategory_ledger_rw ON "GivingCategory"
  FOR ALL
  USING (public.finance_can_read_ledger("ownerType", "ownerId", "dioceseId", "parishId"))
  WITH CHECK (public.finance_can_write_ledger("ownerType", "ownerId", "dioceseId", "parishId"));
```

- [ ] **Step 2: Apply.** Run: `npm run db:apply-rls`
  Expected: `Applying supabase/migrations/20260712000002_r5_giving_categories_rls.sql … OK`.

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/20260712000002_r5_giving_categories_rls.sql
git commit -m "feat(finance): RLS for GivingCategory (owner-scoped)"
```

---

## Task 3: Pure batch grouping helper + unit test

**Files:**
- Create: `lib/finance/batch.ts`
- Create: `tests/unit/finance/batch.test.ts`

**Interfaces:**
- Produces: `type BatchLine = { incomeAccountId: string; amountCents: bigint }`; `function groupCreditsByAccount(lines: BatchLine[]): { accountId: string; amountCents: bigint }[]`; `function batchTotalCents(lines: { amountCents: bigint }[]): bigint`.

- [ ] **Step 1: Write the failing test** in `tests/unit/finance/batch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupCreditsByAccount, batchTotalCents } from '@/lib/finance/batch';

describe('batch grouping', () => {
  it('sums credits per income account and totals', () => {
    const lines = [
      { incomeAccountId: 'a', amountCents: 5000n },
      { incomeAccountId: 'b', amountCents: 2500n },
      { incomeAccountId: 'a', amountCents: 1500n },
    ];
    const grouped = groupCreditsByAccount(lines);
    expect(grouped.find((g) => g.accountId === 'a')?.amountCents).toBe(6500n);
    expect(grouped.find((g) => g.accountId === 'b')?.amountCents).toBe(2500n);
    expect(batchTotalCents(lines)).toBe(9000n);
  });
  it('handles empty', () => {
    expect(groupCreditsByAccount([])).toEqual([]);
    expect(batchTotalCents([])).toBe(0n);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run --project unit tests/unit/finance/batch.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/finance/batch.ts`:**

```ts
export type BatchLine = { incomeAccountId: string; amountCents: bigint };

export function groupCreditsByAccount(
  lines: BatchLine[],
): { accountId: string; amountCents: bigint }[] {
  const map = new Map<string, bigint>();
  for (const l of lines) {
    map.set(l.incomeAccountId, (map.get(l.incomeAccountId) ?? 0n) + l.amountCents);
  }
  return [...map.entries()].map(([accountId, amountCents]) => ({ accountId, amountCents }));
}

export function batchTotalCents(lines: { amountCents: bigint }[]): bigint {
  return lines.reduce((a, l) => a + l.amountCents, 0n);
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npx vitest run --project unit tests/unit/finance/batch.test.ts` → Expected: PASS (2).

- [ ] **Step 5: Commit.**

```bash
git add lib/finance/batch.ts tests/unit/finance/batch.test.ts
git commit -m "feat(finance): pure batch credit-grouping helpers + unit test"
```

---

## Task 4: Validation helpers

**Files:**
- Modify: `lib/finance/validate.ts`

**Interfaces:**
- Produces: `parseGivingCategory(body)` → `{ name, section, sortOrder, fundId, incomeAccountId, isTaxDeductible, countsToStatement }`; `parseBatchDonationLine(body)` → `{ amountCents, categoryId, method, familyId, memberId, externalDonorId, isAnonymous, checkNumber, receivedAt }`.

- [ ] **Step 1: Add helpers** to `lib/finance/validate.ts` (reuse existing `requireUuid`, `optionalUuid`, `requireNonEmptyString`, `requireCents`, `requireDate`, `parseDonationMethod`):

```ts
export function parseGivingCategory(body: Record<string, unknown>) {
  return {
    name: requireNonEmptyString('name', body.name),
    section: requireNonEmptyString('section', body.section),
    sortOrder:
      typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)
        ? body.sortOrder
        : 0,
    fundId: optionalUuid('fundId', body.fundId),
    incomeAccountId: requireUuid('incomeAccountId', body.incomeAccountId),
    isTaxDeductible: body.isTaxDeductible !== false,
    countsToStatement: body.countsToStatement !== false,
  };
}

export function parseBatchDonationLine(body: Record<string, unknown>) {
  const isAnonymous = body.isAnonymous === true;
  const familyId = optionalUuid('familyId', body.familyId);
  const memberId = optionalUuid('memberId', body.memberId);
  const externalDonorId = optionalUuid('externalDonorId', body.externalDonorId);
  if (isAnonymous && (familyId || memberId || externalDonorId)) {
    throw new ApiError(400, 'Anonymous gifts cannot have a donor');
  }
  return {
    amountCents: requireCents('amountCents', body.amountCents),
    categoryId: requireUuid('categoryId', body.categoryId),
    method: parseDonationMethod(body.method),
    familyId,
    memberId,
    externalDonorId,
    isAnonymous,
    checkNumber:
      typeof body.checkNumber === 'string' ? body.checkNumber.trim() || null : null,
    receivedAt:
      typeof body.receivedAt === 'string' && body.receivedAt.trim()
        ? requireDate('receivedAt', body.receivedAt)
        : null,
  };
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit.**

```bash
git add lib/finance/validate.ts
git commit -m "feat(finance): validation for giving categories + batch donation lines"
```

---

## Task 5: Giving categories API

**Files:**
- Create: `app/api/finance/giving-categories/route.ts`, `app/api/finance/giving-categories/[id]/route.ts`

**Interfaces:**
- Consumes: `parseGivingCategory`, `parseOwnerQuery`, `resolveOrgLedgerParishId`.
- Produces: `GET/POST /api/finance/giving-categories?owner=…`; `PATCH /api/finance/giving-categories/[id]`.

- [ ] **Step 1: Implement GET/POST** in `app/api/finance/giving-categories/route.ts`. GET lists categories for the resolved ledger owner (order by `section, sortOrder, name`), serializing (no BigInt fields). POST validates the account/fund belong to the same owner, then `tx.givingCategory.create({ data: { dioceseId, parishId, ownerType, ownerId, ...parsed } })`; audit `finance.givingcategory.create`. Roles: `GLOBAL_ADMIN, DIOCESE_ADMIN, DIOCESE_STAFF, PARISH_ADMIN, PARISH_STAFF` (mirror `app/api/finance/accounts/route.ts` structure exactly, swapping model + validator).

- [ ] **Step 2: Implement PATCH** in `[id]/route.ts` — load category (RLS-gated), update `name/section/sortOrder/fundId/incomeAccountId/isActive/isTaxDeductible/countsToStatement` when present; audit `finance.givingcategory.update`. (Mirror `app/api/finance/accounts/[id]/route.ts`.)

- [ ] **Step 3: Typecheck + lint.** Run: `npx tsc --noEmit && npx eslint app/api/finance/giving-categories` → clean.
- [ ] **Step 4: Commit.**

```bash
git add app/api/finance/giving-categories
git commit -m "feat(finance): giving-categories API (list/create/edit)"
```

---

## Task 6: External donors API

**Files:**
- Create: `app/api/finance/external-donors/route.ts`, `app/api/finance/external-donors/[id]/route.ts`

**Interfaces:**
- Produces: `GET/POST /api/finance/external-donors` (scope = diocese+parish, like vendors); `PATCH /api/finance/external-donors/[id]`.

- [ ] **Step 1: Implement** mirroring `app/api/finance/vendors/route.ts` + `vendors/[id]/route.ts` exactly, swapping `vendor` → `externalDonor` and fields `{ name, email, phone, address, notes, linkedFamilyId }`. GET filters `dioceseId = claims.diocese_id`, optional `?q=` name contains. Audit `finance.externaldonor.create` / `.update`. Roles: `GLOBAL_ADMIN, DIOCESE_ADMIN, DIOCESE_STAFF, PARISH_ADMIN, PARISH_STAFF`.

- [ ] **Step 2: Typecheck + lint** → clean.
- [ ] **Step 3: Commit.**

```bash
git add app/api/finance/external-donors
git commit -m "feat(finance): external-donors API (non-member donors)"
```

---

## Task 7: Donation batches API (create/list/get/add/remove/post)

**Files:**
- Create: `app/api/finance/donation-batches/route.ts`, `[id]/route.ts`, `[id]/donations/route.ts`, `[id]/donations/[donationId]/route.ts`, `[id]/post/route.ts`

**Interfaces:**
- Consumes: `postJournalEntry`, `findCoveringPeriod` (`lib/finance/posting.ts`), `groupCreditsByAccount`, `batchTotalCents` (`lib/finance/batch.ts`), `parseBatchDonationLine`.
- Produces: batch REST endpoints; posting writes ONE `JournalEntry` (source `DONATION`, cashImpact true).

- [ ] **Step 1: Create batch (POST) + list (GET)** in `route.ts`. POST body `{ owner, batchDate, label, depositReference? }` → `tx.donationBatch.create({ data: { dioceseId, parishId, ownerType, ownerId, batchDate, label, depositReference, status: 'OPEN' } })`; audit `finance.donationbatch.create`. GET lists batches for the owner (order `batchDate desc`), serialize `totalCents`.

- [ ] **Step 2: Batch detail (GET)** in `[id]/route.ts` — batch + its donations (include category name, family/member/externalDonor display), serialize cents.

- [ ] **Step 3: Add donation(s) (POST)** in `[id]/donations/route.ts`. Body: a single line or `{ lines: [...] }`. Load batch (must be `OPEN`). For each line, `parseBatchDonationLine`; resolve `periodId` = `findCoveringPeriod(tx, ledger, line.receivedAt ?? batch.batchDate)` (error if none open); create `tx.donation.create({ data: { dioceseId, parishId, ownerType-less donation fields…, batchId: id, categoryId, fundId: <category.fundId>, periodId, amountCents, method, familyId, memberId, externalDonorId, isAnonymous, checkNumber, receivedAt: line.receivedAt ?? batch.batchDate, status: 'ACTIVE', journalEntryId: null } })`. Update batch `totalCents`/`donationCount` (recompute via aggregate). Audit `finance.donation.create` per line. **Do NOT create a journal here.**

- [ ] **Step 4: Remove donation (DELETE)** in `[id]/donations/[donationId]/route.ts` — only when batch `OPEN`; `tx.donation.delete`; recompute batch totals; audit `finance.donation.void`.

- [ ] **Step 5: Post batch (POST)** in `[id]/post/route.ts`. Body `{ depositAccountId }`. In one `withTenant` tx:
  1. Load batch (`OPEN`) + its active donations incl. `category.incomeAccountId`. Reject if empty or any donation has no `categoryId`/category (400 "assign a category to every gift").
  2. `const total = batchTotalCents(donations)`; `const credits = groupCreditsByAccount(donations.map(d => ({ incomeAccountId: d.category.incomeAccountId, amountCents: d.amountCents })))`.
  3. `period = findCoveringPeriod(tx, ledger, batch.batchDate)` (error if none).
  4. `const entry = await postJournalEntry(tx, { ledger, periodId: period.id, entryDate: batch.batchDate, description: 'Deposit: ' + batch.label, source: 'DONATION', cashImpact: true, status: 'POSTED', createdByUserId: actor.id, lines: [ { accountId: depositAccountId, direction: 'DEBIT', amountCents: total }, ...credits.map(c => ({ accountId: c.accountId, direction: 'CREDIT', amountCents: c.amountCents })) ] })`.
  5. `tx.donationBatch.update({ where: { id }, data: { status: 'POSTED', depositAccountId, postedJournalEntryId: entry.id, totalCents: total, donationCount: donations.length } })`; `tx.donation.updateMany({ where: { batchId: id }, data: { journalEntryId: entry.id } })`.
  6. Audit `finance.donationbatch.post` with `{ total, donationCount, journalEntryId }`.
  Reject a non-OPEN batch with 400.

- [ ] **Step 6: Typecheck + lint** → clean.
- [ ] **Step 7: Commit.**

```bash
git add app/api/finance/donation-batches
git commit -m "feat(finance): donation-batches API with consolidated deposit posting"
```

---

## Task 8: Integration test — batch posting

**Files:**
- Create: `tests/integration/api/r5-donation-batches.test.ts`

- [ ] **Step 1: Write the test.** Seed (via `testDb`) a parish ledger: fund, cash ASSET account, two INCOME accounts (Subscription income, Plate income), an open period covering `2026-06`; two `GivingCategory` rows (Subscription→incomeA, Offertory→incomeB). As `FX.users.parishAAdmin`: create batch (`POST /donation-batches`), add three gifts via `POST /[id]/donations` (a member gift categoryA 10000, an external-donor gift categoryA 5000, an anonymous plate gift categoryB 2500), then `POST /[id]/post { depositAccountId: cash }`. Assert: response 200; exactly ONE `JournalEntry` with `source='DONATION'` linked as `postedJournalEntryId`; its DEBIT line = 17500 to cash; CREDIT lines = {incomeA:15000, incomeB:2500}; batch `status='POSTED'`; all three donations `journalEntryId` = that entry. Then assert re-posting returns ≥400. Follow the shape of `tests/integration/api/r5-finance-modules.test.ts` (route imports, `asUser`, `jreq`).

- [ ] **Step 2: Run.** `npx vitest run --project integration tests/integration/api/r5-donation-batches.test.ts` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add tests/integration/api/r5-donation-batches.test.ts
git commit -m "test(finance): batch deposit posts one balanced journal by category"
```

---

## Task 9: RLS test — category/batch isolation

**Files:**
- Create: `tests/rls/r5-giving-categories.test.ts`

- [ ] **Step 1: Write** following `tests/rls/r5-ledger.test.ts`: seed a parishA income account + GivingCategory (PARISH/parishA); assert parishB admin (`makeClaims`) reads zero of parishA's categories; parishA admin reads it; parishA admin cannot INSERT a category for parishB owner (WITH CHECK rejects). Use `withTenantSession`.
- [ ] **Step 2: Run.** `npx vitest run --project rls tests/rls/r5-giving-categories.test.ts` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add tests/rls/r5-giving-categories.test.ts
git commit -m "test(finance): GivingCategory RLS owner isolation"
```

---

## Task 10: Seed default categories + income accounts

**Files:**
- Modify: `lib/finance/seedChart.ts`, `prisma/seed-finance.ts`

- [ ] **Step 1: Extend the default chart** in `lib/finance/seedChart.ts` `DEFAULT_ACCOUNTS` with income accounts for the categories (codes `41xx`), e.g. `{ code: '4110', name: 'Subscription', type: 'INCOME', fundName: 'General' }`, `4120 Offertory (Plate)`, `4130 Birthday Offertory`, `4140 Christmas Donation`, `4150 Special Donation`, `4160 Wedding Anniversary Offertory`, `4210 Harvest (Mission)` fund 'Missions', `4310 Diocesan Sunday` fund 'General'. Keep existing accounts.

- [ ] **Step 2: Seed categories** in `prisma/seed-finance.ts`. After the ledger chart is seeded for an owner, add a helper `seedGivingCategories(prisma, ledger, chart)` that upserts `GivingCategory` rows mapping each category name → its income account id (looked up by code) + fund + section + sortOrder. Sections: "Church Operation" (Subscription, Offertory, Birthday Offertory, Christmas Donation, Special Donation, Wedding Anniversary Offertory), "Mission Fund" (Harvest), "Diocese Collections" (Diocesan Sunday). Call it for the parish and diocese ledgers alongside `seedLedgerSkeleton`.

- [ ] **Step 3: Run seed.** `npm run db:seed` → completes without error; spot-check `SELECT count(*) FROM "GivingCategory"` > 0.
- [ ] **Step 4: Typecheck.** `npx tsc --noEmit` → exit 0 (note: seed is excluded from app tsc; run `npx tsx --tsconfig tsconfig.json -e "0"` is not needed — just ensure `npm run db:seed` ran clean).
- [ ] **Step 5: Commit.**

```bash
git add lib/finance/seedChart.ts prisma/seed-finance.ts
git commit -m "feat(finance): seed default giving categories + income accounts"
```

---

## Task 11: UI — batches list + new-batch grid + post

**Files:**
- Create: `app/(app)/finance/batches/page.tsx`, `app/(app)/finance/batches/[id]/page.tsx`, `components/finance/donor-picker.tsx`

- [ ] **Step 1: Batch list** `app/(app)/finance/batches/page.tsx` — client page using `useFinanceLedgerOwner()`, `useQuery` on `/api/finance/donation-batches?owner=…`, `DataTable` (date, label, status badge, total, donationCount), "New batch" button (`canWrite`) → creates an OPEN batch (`POST`) then routes to `/finance/batches/[id]?owner=…`. Mirror `app/(app)/finance/bills/page.tsx` structure (states, ForbiddenState, PageSkeleton).

- [ ] **Step 2: Donor picker** `components/finance/donor-picker.tsx` — a control with a mode toggle: Member/Family (search `/api/families`), Non-member (search/create via `/api/finance/external-donors`), Anonymous (plate). Emits `{ familyId?, memberId?, externalDonorId?, isAnonymous }` via `onChange`.

- [ ] **Step 3: New-batch grid** `app/(app)/finance/batches/[id]/page.tsx` — loads batch detail; header (deposit reference, deposit-account select from ASSET accounts). A rows grid: DonorPicker · Amount (`parseCentsInput`) · Category (`GET /giving-categories?owner=…`, preselect first active) · Method select · check#. "Add line" posts to `POST /[id]/donations`; running total from batch detail; "Post batch" → `POST /[id]/post { depositAccountId }`, then shows the linked journal + locks (status POSTED → read-only). Amounts via `formatCents`. Use `data-testid="finance-batch"`.

- [ ] **Step 4: Typecheck + lint** `npx tsc --noEmit && npx eslint "app/(app)/finance/batches" components/finance/donor-picker.tsx` → clean.
- [ ] **Step 5: Commit.**

```bash
git add "app/(app)/finance/batches" components/finance/donor-picker.tsx
git commit -m "feat(finance): batch donation entry UI (grid + consolidated post)"
```

---

## Task 12: UI — giving-categories admin + donations form category + nav

**Files:**
- Create: `app/(app)/finance/giving-categories/page.tsx`
- Modify: `app/(app)/finance/donations/page.tsx`, `lib/nav/menu.ts`, `tests/unit/lib/nav-menu.test.ts`

- [ ] **Step 1: Category admin page** — list + create/edit dialog (name, section, sort order, fund select, income-account select from INCOME accounts, active). Mirror the accounts page edit pattern (render-phase prop sync, no setState-in-effect).

- [ ] **Step 2: Donations form** — add a Category picker to the single Record-donation dialog; when a category is chosen, default the income account from it; add "Non-member" + "Anonymous" donor options (reuse DonorPicker).

- [ ] **Step 3: Nav** — in `lib/nav/menu.ts` add Finance items `Batches` (`/finance/batches`) and `Giving Categories` (`/finance/giving-categories`), `portals: ['parish','diocese']`, roles `['global_admin','diocese_admin','diocese_staff','parish_admin','parish_staff']`. Update the exact-list assertions in `tests/unit/lib/nav-menu.test.ts` (parish-admin visibleNavItems + navSectionsFromClaims Finance items, and diocese-admin diocese-portal list) to include `/finance/batches` and `/finance/giving-categories` in array order.

- [ ] **Step 4: Run nav test + typecheck + lint.** `npx vitest run --project unit tests/unit/lib/nav-menu.test.ts && npx tsc --noEmit && npx eslint "app/(app)/finance" lib/nav/menu.ts` → PASS/clean.
- [ ] **Step 5: Commit.**

```bash
git add "app/(app)/finance/giving-categories" "app/(app)/finance/donations/page.tsx" lib/nav/menu.ts tests/unit/lib/nav-menu.test.ts
git commit -m "feat(finance): giving-categories admin + category on donation form + nav"
```

---

## Task 13: Ship — full suite, build, PR, deploy

- [ ] **Step 1: Full suite.** `npm run test:unit && npm run test:integration && npm run test:rls` → all green.
- [ ] **Step 2: Production build.** `npx next build` → compiles; finance routes incl. `/finance/batches`, `/api/finance/donation-batches/*` present.
- [ ] **Step 3: Push + PR.** `git push -u origin feature/r5-batch-donations` then `gh pr create --base main --title "feat(finance): batch donation entry + giving categories" --body "…"` (summarize: categories, batch grid, consolidated deposit posting, external donors/anonymous plate, seed, tests).
- [ ] **Step 4: Verify Vercel preview** reaches READY (via the Vercel deployment tools / `gh pr checks`).
- [ ] **Step 5: Update AGENTS.md** phase-status note (batch giving entry + categories added to R5).

---

## Self-Review

**Spec coverage:** GivingCategory (Task 1,2,5) ✓ · Donation.categoryId (Task 1) ✓ · batch deposit account (Task 1) ✓ · consolidated posting (Task 3,7,8) ✓ · non-members (Task 6,11,12) ✓ · anonymous plate (Task 4,7,8,11) ✓ · PA-22 preserved (no member auto-allocation; Task 7 sets categoryId not member; statements unchanged) ✓ · seed (Task 10) ✓ · UI (Task 11,12) ✓ · RLS (Task 2,9) ✓ · integration+unit (Task 3,8) ✓ · nav (Task 12) ✓.
**Placeholder scan:** load-bearing code (schema, RLS policy, grouping helper, posting orchestration, validators) is fully specified; UI/mirror tasks reference exact existing files to copy patterns from. No TBD/TODO.
**Type consistency:** `groupCreditsByAccount`→`{accountId,amountCents}` consumed in Task 7 step 5 as `c.accountId`/`c.amountCents` ✓; `parseBatchDonationLine` fields consumed in Task 7 step 3 ✓; `GivingCategory.incomeAccountId` used in Task 7 posting ✓.
