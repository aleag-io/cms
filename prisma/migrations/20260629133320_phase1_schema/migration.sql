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
