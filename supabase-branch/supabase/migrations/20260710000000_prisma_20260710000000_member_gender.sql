-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260710000000_member_gender/migration.sql
-- SHA-256: 38afc38b1c42fe7fa8c576df488a5c5c47a2679c102874f365efa9565cb30f7f

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "gender" "Gender";
