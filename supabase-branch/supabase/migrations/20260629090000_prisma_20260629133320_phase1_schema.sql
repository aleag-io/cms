-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260629133320_phase1_schema/migration.sql
-- SHA-256: b7e7d77cc4ece090bdb44ecc8c18e487c53663d5f1965d5d78d8a6480782fb0d

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "transferredAt" TIMESTAMP(3),
ADD COLUMN     "transferredFromParishId" UUID,
ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "Parish" ADD COLUMN     "familyNumberPrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "familyNumberStart" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "familyNumberWidth" INTEGER NOT NULL DEFAULT 4;

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");
