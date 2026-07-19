-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260718020514_r6_reporting_integrations/migration.sql
-- SHA-256: 6cfcb7dc4df7b15087d7855b4d6ea27c6a7f8c0cf81944360139c7515626d9c3

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionResource" ADD VALUE 'REPORT';
ALTER TYPE "PermissionResource" ADD VALUE 'MEMBER_IMPORT';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "reportSection" TEXT;

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookSubscription_dioceseId_parishId_isActive_idx" ON "WebhookSubscription"("dioceseId", "parishId", "isActive");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_createdAt_idx" ON "WebhookEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_dioceseId_parishId_type_idx" ON "WebhookEvent"("dioceseId", "parishId", "type");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_dioceseId_parishId_createdAt_idx" ON "WebhookDelivery"("dioceseId", "parishId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_subscriptionId_eventId_key" ON "WebhookDelivery"("subscriptionId", "eventId");

-- CreateIndex
CREATE INDEX "Account_parishId_ownerType_ownerId_idx" ON "Account"("parishId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_parishId_ownerType_ownerId_status_idx" ON "AccountingPeriod"("parishId", "ownerType", "ownerId", "status");

-- CreateIndex
CREATE INDEX "ApprovalDecision_approverUserId_idx" ON "ApprovalDecision"("approverUserId");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_parishId_idx" ON "ApprovalPolicy"("parishId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_parishId_status_idx" ON "ApprovalRequest"("parishId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_makerUserId_idx" ON "ApprovalRequest"("makerUserId");

-- CreateIndex
CREATE INDEX "BankStatementLine_dioceseId_parishId_postedDate_idx" ON "BankStatementLine"("dioceseId", "parishId", "postedDate");

-- CreateIndex
CREATE INDEX "Budget_dioceseId_idx" ON "Budget"("dioceseId");

-- CreateIndex
CREATE INDEX "Budget_parishId_idx" ON "Budget"("parishId");

-- CreateIndex
CREATE INDEX "BudgetLine_accountId_idx" ON "BudgetLine"("accountId");

-- CreateIndex
CREATE INDEX "Campaign_fundId_idx" ON "Campaign"("fundId");

-- CreateIndex
CREATE INDEX "Donation_externalDonorId_idx" ON "Donation"("externalDonorId");

-- CreateIndex
CREATE INDEX "Donation_campaignId_idx" ON "Donation"("campaignId");

-- CreateIndex
CREATE INDEX "DonationAllocation_fundId_idx" ON "DonationAllocation"("fundId");

-- CreateIndex
CREATE INDEX "DonationBatch_status_idx" ON "DonationBatch"("status");

-- CreateIndex
CREATE INDEX "ExternalDonor_linkedFamilyId_idx" ON "ExternalDonor"("linkedFamilyId");

-- CreateIndex
CREATE INDEX "GivingStatement_memberId_idx" ON "GivingStatement"("memberId");

-- CreateIndex
CREATE INDEX "GivingStatement_familyId_idx" ON "GivingStatement"("familyId");

-- CreateIndex
CREATE INDEX "JournalEntry_parishId_status_idx" ON "JournalEntry"("parishId", "status");

-- CreateIndex
CREATE INDEX "Organization_dioceseId_isActive_idx" ON "Organization"("dioceseId", "isActive");

-- CreateIndex
CREATE INDEX "Pledge_status_idx" ON "Pledge"("status");

-- CreateIndex
CREATE INDEX "Pledge_familyId_idx" ON "Pledge"("familyId");

-- CreateIndex
CREATE INDEX "Pledge_memberId_idx" ON "Pledge"("memberId");

-- CreateIndex
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");

-- CreateIndex
CREATE INDEX "VendorBill_ownerType_ownerId_idx" ON "VendorBill"("ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_dioceseId_fkey" FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Account_dioceseId_owner_idx" RENAME TO "Account_dioceseId_ownerType_ownerId_idx";

-- RenameIndex
ALTER INDEX "AccountingPeriod_diocese_status_idx" RENAME TO "AccountingPeriod_dioceseId_ownerType_ownerId_status_idx";

-- RenameIndex
ALTER INDEX "AccountingPeriod_owner_dates_key" RENAME TO "AccountingPeriod_ownerType_ownerId_startDate_endDate_key";

-- RenameIndex
ALTER INDEX "ApprovalDecision_req_approver_key" RENAME TO "ApprovalDecision_approvalRequestId_approverUserId_key";

-- RenameIndex
ALTER INDEX "ApprovalPolicy_owner_entity_key" RENAME TO "ApprovalPolicy_ownerType_ownerId_entityKind_key";

-- RenameIndex
ALTER INDEX "ApprovalRequest_diocese_status_idx" RENAME TO "ApprovalRequest_dioceseId_status_idx";

-- RenameIndex
ALTER INDEX "ApprovalRequest_entity_idx" RENAME TO "ApprovalRequest_entityKind_entityId_idx";

-- RenameIndex
ALTER INDEX "BankStatementLine_line_idx" RENAME TO "BankStatementLine_reconciledJournalLineId_idx";

-- RenameIndex
ALTER INDEX "BankStatementLine_run_idx" RENAME TO "BankStatementLine_reconciliationRunId_idx";

-- RenameIndex
ALTER INDEX "Budget_owner_year_key" RENAME TO "Budget_ownerType_ownerId_fiscalYear_key";

-- RenameIndex
ALTER INDEX "BudgetLine_budget_acct_key" RENAME TO "BudgetLine_budgetId_accountId_key";

-- RenameIndex
ALTER INDEX "Campaign_scope_status_idx" RENAME TO "Campaign_dioceseId_parishId_status_idx";

-- RenameIndex
ALTER INDEX "Donation_ext_txn_key" RENAME TO "Donation_dioceseId_parishId_externalTxnId_key";

-- RenameIndex
ALTER INDEX "Donation_scope_recv_idx" RENAME TO "Donation_dioceseId_parishId_receivedAt_idx";

-- RenameIndex
ALTER INDEX "DonationBatch_scope_date_idx" RENAME TO "DonationBatch_dioceseId_parishId_batchDate_idx";

-- RenameIndex
ALTER INDEX "ExternalDonor_scope_name_idx" RENAME TO "ExternalDonor_dioceseId_parishId_name_idx";

-- RenameIndex
ALTER INDEX "Fund_dioceseId_owner_idx" RENAME TO "Fund_dioceseId_ownerType_ownerId_idx";

-- RenameIndex
ALTER INDEX "Fund_parishId_owner_idx" RENAME TO "Fund_parishId_ownerType_ownerId_idx";

-- RenameIndex
ALTER INDEX "GivingCategory_owner_name_key" RENAME TO "GivingCategory_ownerType_ownerId_name_key";

-- RenameIndex
ALTER INDEX "GivingCategory_parish_owner_idx" RENAME TO "GivingCategory_parishId_ownerType_ownerId_idx";

-- RenameIndex
ALTER INDEX "GivingCategory_scope_section_idx" RENAME TO "GivingCategory_dioceseId_ownerType_ownerId_section_sortOrde_idx";

-- RenameIndex
ALTER INDEX "GivingStatement_scope_period_idx" RENAME TO "GivingStatement_dioceseId_parishId_periodType_periodKey_idx";

-- RenameIndex
ALTER INDEX "GivingStatement_unique_recipient_key" RENAME TO "GivingStatement_dioceseId_parishId_periodType_periodKey_rec_key";

-- RenameIndex
ALTER INDEX "JournalEntry_diocese_status_idx" RENAME TO "JournalEntry_dioceseId_status_idx";

-- RenameIndex
ALTER INDEX "JournalEntry_owner_date_idx" RENAME TO "JournalEntry_ownerType_ownerId_entryDate_idx";

-- RenameIndex
ALTER INDEX "JournalEntry_reverses_idx" RENAME TO "JournalEntry_reversesEntryId_idx";

-- RenameIndex
ALTER INDEX "Payment_scope_paid_idx" RENAME TO "Payment_dioceseId_parishId_paidAt_idx";

-- RenameIndex
ALTER INDEX "Pledge_scope_camp_idx" RENAME TO "Pledge_dioceseId_parishId_campaignId_idx";

-- RenameIndex
ALTER INDEX "ReconciliationRun_scope_status_idx" RENAME TO "ReconciliationRun_dioceseId_parishId_status_idx";

-- RenameIndex
ALTER INDEX "StripeEvent_scope_idx" RENAME TO "StripeEvent_dioceseId_parishId_idx";

-- RenameIndex
ALTER INDEX "Vendor_scope_name_idx" RENAME TO "Vendor_dioceseId_parishId_name_idx";

-- RenameIndex
ALTER INDEX "VendorBill_scope_status_idx" RENAME TO "VendorBill_dioceseId_parishId_status_idx";
