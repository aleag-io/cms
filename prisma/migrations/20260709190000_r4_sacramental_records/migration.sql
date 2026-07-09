-- R4 / M8 — Sacramental register (schema only; RLS in Supabase migration)

-- AlterEnum: PermissionResource
ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'MEMBER_SACRAMENTAL_RECORD';

-- CreateEnum
CREATE TYPE "SacramentType" AS ENUM (
  'BAPTISM',
  'HOLY_COMMUNION',
  'CONFIRMATION',
  'CONFESSION',
  'MARRIAGE',
  'ORDINATION',
  'ANOINTING_OF_THE_SICK'
);

-- CreateTable
CREATE TABLE "SacramentalRecord" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "sacramentType" "SacramentType" NOT NULL,
  "occurredOn" DATE NOT NULL,
  "officiantName" TEXT,
  "locationText" TEXT,
  "registerBook" TEXT,
  "registerPage" TEXT,
  "registerEntry" TEXT,
  "notes" TEXT,
  "sponsorNames" TEXT,
  "spouseMemberId" UUID,
  "spouseName" TEXT,
  "witnessNames" TEXT,
  "ordainedOffice" TEXT,
  "pastoralNoteRef" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SacramentalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SacramentalRecord_parishId_sacramentType_occurredOn_idx"
  ON "SacramentalRecord"("parishId", "sacramentType", "occurredOn");

CREATE INDEX "SacramentalRecord_memberId_sacramentType_idx"
  ON "SacramentalRecord"("memberId", "sacramentType");

CREATE INDEX "SacramentalRecord_parishId_isActive_idx"
  ON "SacramentalRecord"("parishId", "isActive");

-- AddForeignKey
ALTER TABLE "SacramentalRecord"
  ADD CONSTRAINT "SacramentalRecord_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SacramentalRecord"
  ADD CONSTRAINT "SacramentalRecord_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SacramentalRecord"
  ADD CONSTRAINT "SacramentalRecord_spouseMemberId_fkey"
  FOREIGN KEY ("spouseMemberId") REFERENCES "Member"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SacramentalRecord"
  ADD CONSTRAINT "SacramentalRecord_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
