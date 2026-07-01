-- Add Phase 4 roles to Role enum.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIOCESE_REPORT_VIEWER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARISH_DATA_SHARING_MANAGER';

-- New enums
CREATE TYPE "DataCategory" AS ENUM (
  'MEMBER_DIRECTORY',
  'MEMBER_DEMOGRAPHICS_DETAIL',
  'FAMILY_RECORDS',
  'SACRAMENTAL_RECORDS',
  'GIVING_DETAIL',
  'GIVING_STATEMENTS',
  'PROGRAM_ROSTER',
  'FINANCIAL_STATEMENTS',
  'LEDGER_DETAIL',
  'ATTENDANCE_DETAIL',
  'AUDIT_LOG',
  'COMMUNICATIONS_HISTORY'
);

CREATE TYPE "GranteeType" AS ENUM ('DIOCESE', 'PARISH');
CREATE TYPE "SharingScope" AS ENUM ('ALL_RECORDS', 'SUMMARY_ONLY', 'PROGRAM_SCOPED', 'PERIOD_SCOPED');
CREATE TYPE "SharingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ShareMode" AS ENUM ('USER_SHARE', 'ROLE_SHARE', 'SECURE_LINK');

CREATE TABLE "DataSharingRequest" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "dataCategory" "DataCategory" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "SharingRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DataSharingRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataSharingGrant" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "dataCategory" "DataCategory" NOT NULL,
  "granteeType" "GranteeType" NOT NULL DEFAULT 'DIOCESE',
  "granteeId" UUID NOT NULL,
  "granteeRoleFilter" "Role",
  "scope" "SharingScope" NOT NULL DEFAULT 'ALL_RECORDS',
  "scopeDetail" JSONB,
  "grantedByUserId" UUID NOT NULL,
  "requestId" UUID,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" UUID,
  "notes" TEXT,

  CONSTRAINT "DataSharingGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyAccessGrant" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "grantedByUserId" UUID NOT NULL,
  "justification" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" UUID,

  CONSTRAINT "EmergencyAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContextualShare" (
  "id" UUID NOT NULL,
  "parishId" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "shareMode" "ShareMode" NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "recipientUserId" UUID,
  "recipientRole" "Role",
  "tokenHash" TEXT,
  "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3),
  "maxViews" INTEGER,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContextualShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataSharingGrant_requestId_key" ON "DataSharingGrant"("requestId");
CREATE UNIQUE INDEX "ContextualShare_tokenHash_key" ON "ContextualShare"("tokenHash");

CREATE INDEX "DataSharingRequest_parishId_status_idx" ON "DataSharingRequest"("parishId", "status");
CREATE INDEX "DataSharingRequest_dioceseId_status_idx" ON "DataSharingRequest"("dioceseId", "status");
CREATE INDEX "DataSharingRequest_expiresAt_idx" ON "DataSharingRequest"("expiresAt");
CREATE INDEX "DataSharingGrant_parishId_dataCategory_isActive_idx" ON "DataSharingGrant"("parishId", "dataCategory", "isActive");
CREATE INDEX "DataSharingGrant_dioceseId_granteeId_isActive_idx" ON "DataSharingGrant"("dioceseId", "granteeId", "isActive");
CREATE INDEX "DataSharingGrant_expiresAt_idx" ON "DataSharingGrant"("expiresAt");
CREATE INDEX "EmergencyAccessGrant_parishId_isActive_idx" ON "EmergencyAccessGrant"("parishId", "isActive");
CREATE INDEX "EmergencyAccessGrant_dioceseId_isActive_idx" ON "EmergencyAccessGrant"("dioceseId", "isActive");
CREATE INDEX "EmergencyAccessGrant_expiresAt_idx" ON "EmergencyAccessGrant"("expiresAt");
CREATE INDEX "ContextualShare_parishId_resourceType_isActive_idx" ON "ContextualShare"("parishId", "resourceType", "isActive");
CREATE INDEX "ContextualShare_dioceseId_isActive_idx" ON "ContextualShare"("dioceseId", "isActive");
CREATE INDEX "ContextualShare_expiresAt_idx" ON "ContextualShare"("expiresAt");

ALTER TABLE "DataSharingRequest" ADD CONSTRAINT "DataSharingRequest_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSharingRequest" ADD CONSTRAINT "DataSharingRequest_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSharingRequest" ADD CONSTRAINT "DataSharingRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataSharingRequest" ADD CONSTRAINT "DataSharingRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataSharingGrant" ADD CONSTRAINT "DataSharingGrant_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSharingGrant" ADD CONSTRAINT "DataSharingGrant_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSharingGrant" ADD CONSTRAINT "DataSharingGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataSharingGrant" ADD CONSTRAINT "DataSharingGrant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSharingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataSharingGrant" ADD CONSTRAINT "DataSharingGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmergencyAccessGrant" ADD CONSTRAINT "EmergencyAccessGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContextualShare" ADD CONSTRAINT "ContextualShare_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextualShare" ADD CONSTRAINT "ContextualShare_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextualShare" ADD CONSTRAINT "ContextualShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextualShare" ADD CONSTRAINT "ContextualShare_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContextualShare" ADD CONSTRAINT "ContextualShare_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
