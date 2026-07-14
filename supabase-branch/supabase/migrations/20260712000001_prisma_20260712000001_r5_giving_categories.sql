-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260712000001_r5_giving_categories/migration.sql
-- SHA-256: 257eaf952d8f1ef1880b91591b77140b127c635f87982974d2d5cbb4aa62aa00

-- R5 / M10 — Giving categories + donation-batch deposit account + donation.categoryId

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
