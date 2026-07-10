-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "gender" "Gender";
