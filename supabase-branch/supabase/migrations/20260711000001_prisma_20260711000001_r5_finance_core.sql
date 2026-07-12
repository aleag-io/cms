-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260711000001_r5_finance_core/migration.sql
-- SHA-256: bea8890d2cb75b42b55864874459fa59f6f1adffaff6dde7662051c6dcd21951

-- R5 / M10 — Finance multi-level ledgers (diocese / parish / org)
-- Scopes: DIOCESE, PARISH, ORGANIZATION (diocese-org when parishId null)

ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'FINANCE_LEDGER';
ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'FINANCE_APPROVAL';
ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'FINANCE_GIVING';

CREATE TYPE "LedgerOwnerType" AS ENUM ('DIOCESE', 'PARISH', 'ORGANIZATION');
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "JournalDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'VOID');
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalSource" AS ENUM ('MANUAL', 'DONATION', 'STRIPE', 'VENDOR_BILL', 'PAYMENT', 'REVERSAL', 'BATCH_ADJUSTMENT');
CREATE TYPE "ApprovalMode" AS ENUM ('STRICT', 'THRESHOLD_BASED', 'HYBRID');
CREATE TYPE "ApprovalEntityKind" AS ENUM ('JOURNAL', 'VENDOR_BILL', 'PAYMENT');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');
CREATE TYPE "ApprovalDecisionType" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "DonationMethod" AS ENUM ('CASH', 'CHECK', 'ZELLE', 'ACH', 'CARD', 'STOCK', 'OTHER');
CREATE TYPE "DonationStatus" AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "DonationBatchStatus" AS ENUM ('OPEN', 'POSTED', 'VOID');
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PledgeStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'LAPSED', 'CANCELLED');
CREATE TYPE "PledgeFrequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'ANNUAL');
CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'PAID', 'VOID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'ACH', 'ONLINE', 'OTHER');
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'LOCKED', 'ARCHIVED');
CREATE TYPE "BankLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('OPEN', 'COMPLETED');
CREATE TYPE "GivingStatementRecipientType" AS ENUM ('FAMILY', 'MEMBER', 'EXTERNAL_DONOR');
CREATE TYPE "GivingStatementPeriodType" AS ENUM ('ANNUAL', 'QUARTERLY');
CREATE TYPE "GivingStatementStatus" AS ENUM ('GENERATED', 'SENT', 'FAILED');

-- Allow diocese-scoped organizations
ALTER TABLE "Organization" ALTER COLUMN "parishId" DROP NOT NULL;
ALTER TABLE "OrganizationMembership" ALTER COLUMN "parishId" DROP NOT NULL;
ALTER TABLE "OrganizationOfficer" ALTER COLUMN "parishId" DROP NOT NULL;

ALTER TABLE "Family" ADD COLUMN IF NOT EXISTS "envelopeNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Family_parishId_envelopeNumber_key" ON "Family"("parishId", "envelopeNumber");

CREATE TABLE "Fund" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"name" TEXT NOT NULL,
"isActive" BOOLEAN NOT NULL DEFAULT true,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "Fund_ownerType_ownerId_name_key" ON "Fund"("ownerType","ownerId","name");
CREATE INDEX "Fund_dioceseId_owner_idx" ON "Fund"("dioceseId","ownerType","ownerId");
CREATE INDEX "Fund_parishId_owner_idx" ON "Fund"("parishId","ownerType","ownerId");
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Account" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"code" TEXT NOT NULL,
"name" TEXT NOT NULL,
"type" "AccountType" NOT NULL,
"fundId" UUID,
"isActive" BOOLEAN NOT NULL DEFAULT true,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "Account_ownerType_ownerId_code_key" ON "Account"("ownerType","ownerId","code");
CREATE INDEX "Account_dioceseId_owner_idx" ON "Account"("dioceseId","ownerType","ownerId");
CREATE INDEX "Account_fundId_idx" ON "Account"("fundId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AccountingPeriod" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"startDate" DATE NOT NULL,
"endDate" DATE NOT NULL,
"status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
"closedByUserId" UUID,
"closedAt" TIMESTAMP(3),
"reopenReason" TEXT,
"reopenedByUserId" UUID,
"reopenedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingPeriod_dates_check" CHECK ("endDate" >= "startDate")
,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "AccountingPeriod_owner_dates_key" ON "AccountingPeriod"("ownerType","ownerId","startDate","endDate");
CREATE INDEX "AccountingPeriod_diocese_status_idx" ON "AccountingPeriod"("dioceseId","ownerType","ownerId","status");
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "JournalEntry" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"periodId" UUID NOT NULL,
"entryDate" DATE NOT NULL,
"description" TEXT NOT NULL,
"reference" TEXT,
"source" "JournalSource" NOT NULL DEFAULT 'MANUAL',
"status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
"cashImpact" BOOLEAN NOT NULL DEFAULT true,
"reversesEntryId" UUID,
"currency" CHAR(3) NOT NULL DEFAULT 'USD',
"createdByUserId" UUID NOT NULL,
"postedByUserId" UUID,
"postedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "JournalEntry_owner_date_idx" ON "JournalEntry"("ownerType","ownerId","entryDate");
CREATE INDEX "JournalEntry_periodId_idx" ON "JournalEntry"("periodId");
CREATE INDEX "JournalEntry_diocese_status_idx" ON "JournalEntry"("dioceseId","status");
CREATE INDEX "JournalEntry_reverses_idx" ON "JournalEntry"("reversesEntryId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "JournalLine" (
"id" UUID NOT NULL,
"journalEntryId" UUID NOT NULL,
"accountId" UUID NOT NULL,
"direction" "JournalDirection" NOT NULL,
"amountCents" BIGINT NOT NULL,
"memo" TEXT,
  CONSTRAINT "JournalLine_amount_positive" CHECK ("amountCents" > 0)
,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApprovalPolicy" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"entityKind" "ApprovalEntityKind" NOT NULL,
"mode" "ApprovalMode" NOT NULL DEFAULT 'THRESHOLD_BASED',
"thresholdCents" BIGINT,
"approverRoles" "Role"[],
"minApprovals" INTEGER NOT NULL DEFAULT 1,
"sensitiveKinds" "ApprovalEntityKind"[] DEFAULT ARRAY[]::"ApprovalEntityKind"[],
"isActive" BOOLEAN NOT NULL DEFAULT true,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "ApprovalPolicy_owner_entity_key" ON "ApprovalPolicy"("ownerType","ownerId","entityKind");
CREATE INDEX "ApprovalPolicy_dioceseId_idx" ON "ApprovalPolicy"("dioceseId");
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ApprovalRequest" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"entityKind" "ApprovalEntityKind" NOT NULL,
"entityId" UUID NOT NULL,
"makerUserId" UUID NOT NULL,
"amountCents" BIGINT NOT NULL,
"status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
"requiredApprovals" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "ApprovalRequest_diocese_status_idx" ON "ApprovalRequest"("dioceseId","status");
CREATE INDEX "ApprovalRequest_entity_idx" ON "ApprovalRequest"("entityKind","entityId");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_makerUserId_fkey" FOREIGN KEY ("makerUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApprovalDecision" (
"id" UUID NOT NULL,
"approvalRequestId" UUID NOT NULL,
"approverUserId" UUID NOT NULL,
"decision" "ApprovalDecisionType" NOT NULL,
"note" TEXT,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "ApprovalDecision_req_approver_key" ON "ApprovalDecision"("approvalRequestId","approverUserId");
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExternalDonor" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"name" TEXT NOT NULL,
"email" TEXT,
"phone" TEXT,
"address" TEXT,
"notes" TEXT,
"linkedFamilyId" UUID,
"isActive" BOOLEAN NOT NULL DEFAULT true,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "ExternalDonor_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "ExternalDonor_scope_name_idx" ON "ExternalDonor"("dioceseId","parishId","name");
ALTER TABLE "ExternalDonor" ADD CONSTRAINT "ExternalDonor_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalDonor" ADD CONSTRAINT "ExternalDonor_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalDonor" ADD CONSTRAINT "ExternalDonor_linkedFamilyId_fkey" FOREIGN KEY ("linkedFamilyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Campaign" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"name" TEXT NOT NULL,
"description" TEXT,
"fundId" UUID NOT NULL,
"accountId" UUID NOT NULL,
"goalCents" BIGINT NOT NULL,
"startDate" DATE NOT NULL,
"endDate" DATE NOT NULL,
"status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "Campaign_scope_status_idx" ON "Campaign"("dioceseId","parishId","status");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DonationBatch" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"batchDate" DATE NOT NULL,
"label" TEXT NOT NULL,
"status" "DonationBatchStatus" NOT NULL DEFAULT 'OPEN',
"totalCents" BIGINT NOT NULL DEFAULT 0,
"donationCount" INTEGER NOT NULL DEFAULT 0,
"depositReference" TEXT,
"postedJournalEntryId" UUID,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "DonationBatch_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "DonationBatch_scope_date_idx" ON "DonationBatch"("dioceseId","parishId","batchDate");
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_postedJournalEntryId_fkey" FOREIGN KEY ("postedJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Donation" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"familyId" UUID,
"memberId" UUID,
"externalDonorId" UUID,
"isAnonymous" BOOLEAN NOT NULL DEFAULT false,
"fundId" UUID,
"campaignId" UUID,
"periodId" UUID NOT NULL,
"batchId" UUID,
"amountCents" BIGINT NOT NULL,
"method" "DonationMethod" NOT NULL,
"checkNumber" TEXT,
"externalTxnId" TEXT,
"dedication" TEXT,
"softCreditNote" TEXT,
"receivedAt" DATE NOT NULL,
"status" "DonationStatus" NOT NULL DEFAULT 'ACTIVE',
"journalEntryId" UUID,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Donation_amount_positive" CHECK ("amountCents" > 0)
,
  CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "Donation_ext_txn_key" ON "Donation"("dioceseId","parishId","externalTxnId");
CREATE INDEX "Donation_scope_recv_idx" ON "Donation"("dioceseId","parishId","receivedAt");
CREATE INDEX "Donation_familyId_idx" ON "Donation"("familyId");
CREATE INDEX "Donation_memberId_idx" ON "Donation"("memberId");
CREATE INDEX "Donation_batchId_idx" ON "Donation"("batchId");
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_externalDonorId_fkey" FOREIGN KEY ("externalDonorId") REFERENCES "ExternalDonor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DonationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DonationAllocation" (
"id" UUID NOT NULL,
"donationId" UUID NOT NULL,
"fundId" UUID NOT NULL,
"amountCents" BIGINT NOT NULL,
  CONSTRAINT "DonationAllocation_amount_positive" CHECK ("amountCents" > 0)
,
  CONSTRAINT "DonationAllocation_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "DonationAllocation_donationId_idx" ON "DonationAllocation"("donationId");
ALTER TABLE "DonationAllocation" ADD CONSTRAINT "DonationAllocation_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DonationAllocation" ADD CONSTRAINT "DonationAllocation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Pledge" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"campaignId" UUID NOT NULL,
"familyId" UUID,
"memberId" UUID,
"amountCents" BIGINT NOT NULL,
"fulfilledCents" BIGINT NOT NULL DEFAULT 0,
"frequency" "PledgeFrequency" NOT NULL DEFAULT 'ONE_TIME',
"status" "PledgeStatus" NOT NULL DEFAULT 'ACTIVE',
"startDate" DATE NOT NULL,
"endDate" DATE,
"lastRemindedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "Pledge_scope_camp_idx" ON "Pledge"("dioceseId","parishId","campaignId");
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Vendor" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"name" TEXT NOT NULL,
"email" TEXT,
"phone" TEXT,
"address" TEXT,
"taxId" TEXT,
"isActive" BOOLEAN NOT NULL DEFAULT true,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "Vendor_scope_name_idx" ON "Vendor"("dioceseId","parishId","name");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VendorBill" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"vendorId" UUID NOT NULL,
"amountCents" BIGINT NOT NULL,
"description" TEXT NOT NULL,
"invoiceNumber" TEXT,
"billDate" DATE NOT NULL,
"dueDate" DATE,
"status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
"journalEntryId" UUID,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "VendorBill_scope_status_idx" ON "VendorBill"("dioceseId","parishId","status");
CREATE INDEX "VendorBill_vendorId_idx" ON "VendorBill"("vendorId");
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Payment" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"vendorBillId" UUID NOT NULL,
"amountCents" BIGINT NOT NULL,
"method" "PaymentMethod" NOT NULL,
"checkNumber" TEXT,
"paidAt" DATE NOT NULL,
"journalEntryId" UUID,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "Payment_scope_paid_idx" ON "Payment"("dioceseId","parishId","paidAt");
CREATE INDEX "Payment_vendorBillId_idx" ON "Payment"("vendorBillId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Budget" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"fiscalYear" INTEGER NOT NULL,
"status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "Budget_owner_year_key" ON "Budget"("ownerType","ownerId","fiscalYear");
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BudgetLine" (
"id" UUID NOT NULL,
"budgetId" UUID NOT NULL,
"accountId" UUID NOT NULL,
"originalCents" BIGINT NOT NULL,
"revisedCents" BIGINT NOT NULL
,
  CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "BudgetLine_budget_acct_key" ON "BudgetLine"("budgetId","accountId");
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReconciliationRun" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"status" "ReconciliationRunStatus" NOT NULL DEFAULT 'OPEN',
"matchedCount" INTEGER NOT NULL DEFAULT 0,
"unmatchedCount" INTEGER NOT NULL DEFAULT 0,
"importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"completedAt" TIMESTAMP(3)
,
  CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "ReconciliationRun_scope_status_idx" ON "ReconciliationRun"("dioceseId","parishId","status");
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BankStatementLine" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"ownerType" "LedgerOwnerType" NOT NULL,
"ownerId" UUID NOT NULL,
"reconciliationRunId" UUID NOT NULL,
"postedDate" DATE NOT NULL,
"amountCents" BIGINT NOT NULL,
"descriptionRaw" TEXT NOT NULL,
"reconciledJournalLineId" UUID,
"status" "BankLineStatus" NOT NULL DEFAULT 'UNMATCHED',
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
,
  CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "BankStatementLine_run_idx" ON "BankStatementLine"("reconciliationRunId");
CREATE INDEX "BankStatementLine_line_idx" ON "BankStatementLine"("reconciledJournalLineId");
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_reconciledJournalLineId_fkey" FOREIGN KEY ("reconciledJournalLineId") REFERENCES "JournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GivingStatement" (
"id" UUID NOT NULL,
"dioceseId" UUID NOT NULL,
"parishId" UUID,
"periodType" "GivingStatementPeriodType" NOT NULL,
"periodKey" TEXT NOT NULL,
"recipientType" "GivingStatementRecipientType" NOT NULL,
"familyId" UUID,
"memberId" UUID,
"externalDonorId" UUID,
"totalCents" BIGINT NOT NULL,
"pdfBlobUrl" TEXT NOT NULL,
"status" "GivingStatementStatus" NOT NULL DEFAULT 'GENERATED',
"sentAt" TIMESTAMP(3),
"generatedByUserId" UUID NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL
,
  CONSTRAINT "GivingStatement_pkey" PRIMARY KEY ("id")

);
CREATE UNIQUE INDEX "GivingStatement_unique_recipient_key" ON "GivingStatement"("dioceseId","parishId","periodType","periodKey","recipientType","familyId","memberId","externalDonorId");
CREATE INDEX "GivingStatement_scope_period_idx" ON "GivingStatement"("dioceseId","parishId","periodType","periodKey");
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_externalDonorId_fkey" FOREIGN KEY ("externalDonorId") REFERENCES "ExternalDonor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GivingStatement" ADD CONSTRAINT "GivingStatement_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StripeEvent" (
"id" TEXT NOT NULL,
"type" TEXT NOT NULL,
"dioceseId" UUID,
"parishId" UUID,
"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"processedAt" TIMESTAMP(3),
"donationId" UUID
,
  CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")

);
CREATE INDEX "StripeEvent_scope_idx" ON "StripeEvent"("dioceseId","parishId");
ALTER TABLE "StripeEvent" ADD CONSTRAINT "StripeEvent_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeEvent" ADD CONSTRAINT "StripeEvent_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
