-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260629181842_phase3_parish_operations/migration.sql
-- SHA-256: bbdef118d84d1dab20e5f1a00551482724cf6fdc8221b6c82ea519029ae9af8a

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('FAITH_FORMATION', 'BIBLE_STUDY', 'YOUTH', 'CHOIR', 'OUTREACH', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrollmentRole" AS ENUM ('PARTICIPANT', 'FACILITATOR', 'COORDINATOR');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('PRAYER_GROUP', 'COMMITTEE', 'AUXILIARY', 'MINISTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipMode" AS ENUM ('OPEN', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "OrgMembershipRole" AS ENUM ('MEMBER', 'OFFICER', 'LEADER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SERVICE', 'MEETING', 'SOCIAL', 'OUTREACH', 'OTHER');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('YES', 'NO', 'MAYBE');

-- CreateEnum
CREATE TYPE "FacilityBookingStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'CANCELLED', 'CLOSURE');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('ALL_MEMBERS', 'FAMILIES', 'PROGRAM', 'ORGANIZATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VolunteerScopeType" AS ENUM ('PROGRAM', 'ORGANIZATION', 'EVENT');

-- AlterEnum
ALTER TYPE "MemberStatus" ADD VALUE 'PENDING';

-- DropIndex
DROP INDEX "Member_userId_idx";

-- AlterTable
ALTER TABLE "Parish" ADD COLUMN     "autoApprove" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "programType" "ProgramType" NOT NULL DEFAULT 'OTHER',
    "coordinatorMemberId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollment" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "role" "EnrollmentRole" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSession" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSessionAttendance" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramSessionAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationType" "OrganizationType" NOT NULL DEFAULT 'OTHER',
    "membershipMode" "MembershipMode" NOT NULL DEFAULT 'OPEN',
    "hasOwnLedger" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "role" "OrgMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "organizationType" "OrganizationType" NOT NULL,
    "membershipMode" "MembershipMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationOfficer" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "termStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationOfficer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "EventType" NOT NULL DEFAULT 'OTHER',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "recurrenceRule" TEXT,
    "maxCapacity" INTEGER,
    "facilityId" UUID,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendance" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'YES',
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityBooking" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "eventId" UUID,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "FacilityBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "audienceType" "AudienceType" NOT NULL DEFAULT 'ALL_MEMBERS',
    "audienceRefId" UUID,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "destination" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationPreference" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAssignment" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "scopeType" "VolunteerScopeType" NOT NULL,
    "programId" UUID,
    "organizationId" UUID,
    "eventId" UUID,
    "roleLabel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRegistration" (
    "id" UUID NOT NULL,
    "dioceseId" UUID NOT NULL,
    "parishId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "familyName" TEXT,
    "notes" TEXT,
    "approvalStatus" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "approvedMemberId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Program_dioceseId_parishId_isActive_idx" ON "Program"("dioceseId", "parishId", "isActive");

-- CreateIndex
CREATE INDEX "Program_coordinatorMemberId_idx" ON "Program"("coordinatorMemberId");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_dioceseId_parishId_idx" ON "ProgramEnrollment"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_memberId_role_idx" ON "ProgramEnrollment"("memberId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollment_programId_memberId_key" ON "ProgramEnrollment"("programId", "memberId");

-- CreateIndex
CREATE INDEX "ProgramSession_dioceseId_parishId_idx" ON "ProgramSession"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "ProgramSession_programId_scheduledAt_idx" ON "ProgramSession"("programId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ProgramSessionAttendance_dioceseId_parishId_idx" ON "ProgramSessionAttendance"("dioceseId", "parishId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSessionAttendance_sessionId_memberId_key" ON "ProgramSessionAttendance"("sessionId", "memberId");

-- CreateIndex
CREATE INDEX "Organization_dioceseId_parishId_isActive_idx" ON "Organization"("dioceseId", "parishId", "isActive");

-- CreateIndex
CREATE INDEX "Organization_parishId_organizationType_idx" ON "Organization"("parishId", "organizationType");

-- CreateIndex
CREATE INDEX "OrganizationMembership_dioceseId_parishId_idx" ON "OrganizationMembership"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_idx" ON "OrganizationMembership"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_memberId_idx" ON "OrganizationMembership"("memberId");

-- CreateIndex
CREATE INDEX "OrganizationOfficer_dioceseId_parishId_idx" ON "OrganizationOfficer"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "OrganizationOfficer_organizationId_isActive_idx" ON "OrganizationOfficer"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "OrganizationOfficer_memberId_idx" ON "OrganizationOfficer"("memberId");

-- CreateIndex
CREATE INDEX "Event_dioceseId_parishId_startAt_idx" ON "Event"("dioceseId", "parishId", "startAt");

-- CreateIndex
CREATE INDEX "Event_facilityId_idx" ON "Event"("facilityId");

-- CreateIndex
CREATE INDEX "EventAttendance_dioceseId_parishId_idx" ON "EventAttendance"("dioceseId", "parishId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendance_eventId_memberId_key" ON "EventAttendance"("eventId", "memberId");

-- CreateIndex
CREATE INDEX "Facility_dioceseId_parishId_isActive_idx" ON "Facility"("dioceseId", "parishId", "isActive");

-- CreateIndex
CREATE INDEX "FacilityBooking_dioceseId_parishId_idx" ON "FacilityBooking"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "FacilityBooking_facilityId_startAt_idx" ON "FacilityBooking"("facilityId", "startAt");

-- CreateIndex
CREATE INDEX "Message_dioceseId_parishId_status_idx" ON "Message"("dioceseId", "parishId", "status");

-- CreateIndex
CREATE INDEX "MessageRecipient_dioceseId_parishId_status_idx" ON "MessageRecipient"("dioceseId", "parishId", "status");

-- CreateIndex
CREATE INDEX "MessageRecipient_status_idx" ON "MessageRecipient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_messageId_memberId_channel_key" ON "MessageRecipient"("messageId", "memberId", "channel");

-- CreateIndex
CREATE INDEX "MessageTemplate_dioceseId_parishId_idx" ON "MessageTemplate"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "CommunicationPreference_dioceseId_parishId_idx" ON "CommunicationPreference"("dioceseId", "parishId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_memberId_channel_key" ON "CommunicationPreference"("memberId", "channel");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_dioceseId_parishId_idx" ON "VolunteerAssignment"("dioceseId", "parishId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_memberId_idx" ON "VolunteerAssignment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRegistration_approvedMemberId_key" ON "MemberRegistration"("approvedMemberId");

-- CreateIndex
CREATE INDEX "MemberRegistration_dioceseId_parishId_approvalStatus_idx" ON "MemberRegistration"("dioceseId", "parishId", "approvalStatus");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_coordinatorMemberId_fkey" FOREIGN KEY ("coordinatorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionAttendance" ADD CONSTRAINT "ProgramSessionAttendance_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionAttendance" ADD CONSTRAINT "ProgramSessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionAttendance" ADD CONSTRAINT "ProgramSessionAttendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOfficer" ADD CONSTRAINT "OrganizationOfficer_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOfficer" ADD CONSTRAINT "OrganizationOfficer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOfficer" ADD CONSTRAINT "OrganizationOfficer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRegistration" ADD CONSTRAINT "MemberRegistration_parishId_fkey" FOREIGN KEY ("parishId") REFERENCES "Parish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRegistration" ADD CONSTRAINT "MemberRegistration_approvedMemberId_fkey" FOREIGN KEY ("approvedMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MemberRelationship_memberId_relatedMemberId_relationshipType_ke" RENAME TO "MemberRelationship_memberId_relatedMemberId_relationshipTyp_key";
