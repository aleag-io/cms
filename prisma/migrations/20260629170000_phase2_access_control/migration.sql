-- Phase 2: Intra-parish access control, sensitive field isolation, and permissions

-- Extend Role enum with Phase 2 roles.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIOCESE_STAFF';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLERGY';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MINISTRY_LEADER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ORGANIZATION_LEADER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PASTORAL_DATA_ACCESSOR';

-- CreateEnum
CREATE TYPE "OfficerType" AS ENUM (
  'CLERGY',
  'BOARD',
  'EXECUTIVE_COMMITTEE',
  'FINANCE_COMMITTEE',
  'TRUSTEE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM (
  'PRIMARY',
  'SECONDARY',
  'UNDERGRADUATE',
  'POSTGRADUATE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM (
  'SPOUSE',
  'PARENT',
  'CHILD',
  'SIBLING',
  'GRANDPARENT',
  'GRANDCHILD',
  'IN_LAW',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM (
  'MEMBER_PROFILE',
  'MEMBER_PRIVATE_NOTE',
  'MEMBER_PASTORAL_DATA',
  'PARISH_DIRECTORY',
  'MEMBER_EXPORT',
  'PARISH_OFFICER',
  'PARISH_PERMISSION_OVERRIDE'
);

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'WRITE', 'DELETE', 'EXPORT', 'SEND');

-- AlterTable
ALTER TABLE "Member"
  ADD COLUMN "workNotes" TEXT,
  ADD COLUMN "educationLevel" "EducationLevel",
  ADD COLUMN "skillsInterests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- One AppUser can map to at most one Member profile.
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");

-- CreateTable
CREATE TABLE "ParishOfficer" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "officerType" "OfficerType" NOT NULL,
  "termStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "termEnd" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParishOfficer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPrivateNote" (
  "id" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberPrivateNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPastoralData" (
  "id" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "dateOfBirth" TIMESTAMP(3),
  "baptismDate" TIMESTAMP(3),
  "chrismationDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberPastoralData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyPastoralData" (
  "id" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "anniversaryDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyPastoralData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRelationship" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "relatedMemberId" UUID NOT NULL,
  "relationshipType" "RelationshipType" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemberRelationship_no_self" CHECK ("memberId" <> "relatedMemberId")
);

-- CreateTable
CREATE TABLE "MemberParish" (
  "id" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "membershipType" "MembershipType" NOT NULL DEFAULT 'PRIMARY',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberParish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParishPermissionOverride" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "role" "Role" NOT NULL,
  "resource" "PermissionResource" NOT NULL,
  "action" "PermissionAction" NOT NULL,
  "isAllowed" BOOLEAN NOT NULL,
  "grantedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParishPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParishOfficer_parishId_officerType_isActive_idx" ON "ParishOfficer"("parishId", "officerType", "isActive");
CREATE INDEX "ParishOfficer_memberId_officerType_idx" ON "ParishOfficer"("memberId", "officerType");

CREATE UNIQUE INDEX "MemberPrivateNote_memberId_key" ON "MemberPrivateNote"("memberId");
CREATE INDEX "MemberPrivateNote_parishId_idx" ON "MemberPrivateNote"("parishId");

CREATE UNIQUE INDEX "MemberPastoralData_memberId_key" ON "MemberPastoralData"("memberId");
CREATE INDEX "MemberPastoralData_parishId_idx" ON "MemberPastoralData"("parishId");

CREATE UNIQUE INDEX "FamilyPastoralData_familyId_key" ON "FamilyPastoralData"("familyId");
CREATE INDEX "FamilyPastoralData_parishId_idx" ON "FamilyPastoralData"("parishId");

CREATE UNIQUE INDEX "MemberRelationship_memberId_relatedMemberId_relationshipType_key"
  ON "MemberRelationship"("memberId", "relatedMemberId", "relationshipType");
CREATE INDEX "MemberRelationship_parishId_idx" ON "MemberRelationship"("parishId");

CREATE UNIQUE INDEX "MemberParish_memberId_parishId_key" ON "MemberParish"("memberId", "parishId");
CREATE INDEX "MemberParish_parishId_isPrimary_idx" ON "MemberParish"("parishId", "isPrimary");
-- Exactly one primary parish per member.
CREATE UNIQUE INDEX "MemberParish_memberId_primary_unique"
  ON "MemberParish"("memberId") WHERE "isPrimary" = true;

CREATE UNIQUE INDEX "ParishPermissionOverride_parishId_role_resource_action_key"
  ON "ParishPermissionOverride"("parishId", "role", "resource", "action");
CREATE INDEX "ParishPermissionOverride_parishId_idx" ON "ParishPermissionOverride"("parishId");

-- Foreign keys
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParishOfficer" ADD CONSTRAINT "ParishOfficer_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParishOfficer" ADD CONSTRAINT "ParishOfficer_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPrivateNote" ADD CONSTRAINT "MemberPrivateNote_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberPrivateNote" ADD CONSTRAINT "MemberPrivateNote_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPastoralData" ADD CONSTRAINT "MemberPastoralData_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberPastoralData" ADD CONSTRAINT "MemberPastoralData_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyPastoralData" ADD CONSTRAINT "FamilyPastoralData_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyPastoralData" ADD CONSTRAINT "FamilyPastoralData_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberRelationship" ADD CONSTRAINT "MemberRelationship_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberRelationship" ADD CONSTRAINT "MemberRelationship_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberRelationship" ADD CONSTRAINT "MemberRelationship_relatedMemberId_fkey"
  FOREIGN KEY ("relatedMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberParish" ADD CONSTRAINT "MemberParish_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberParish" ADD CONSTRAINT "MemberParish_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParishPermissionOverride" ADD CONSTRAINT "ParishPermissionOverride_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParishPermissionOverride" ADD CONSTRAINT "ParishPermissionOverride_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: move Member.dateOfBirth into MemberPastoralData and backfill MemberParish.
INSERT INTO "MemberPastoralData" ("id", "memberId", "parishId", "dateOfBirth", "createdAt", "updatedAt")
SELECT gen_random_uuid(), m."id", m."parishId", m."dateOfBirth", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Member" m
WHERE m."dateOfBirth" IS NOT NULL;

INSERT INTO "MemberParish" ("id", "memberId", "parishId", "isPrimary", "membershipType", "joinedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), m."id", m."parishId", true, 'PRIMARY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Member" m
ON CONFLICT ("memberId", "parishId") DO NOTHING;

ALTER TABLE "Member" DROP COLUMN "dateOfBirth";
