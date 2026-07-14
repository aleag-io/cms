-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260709200000_r4_liturgical_calendar/migration.sql
-- SHA-256: 6e976e152dba7c332bfc831564d37b79eebe16b470bd09d6b2c0e82a4ec9a8a2

-- R4 / M9 — Liturgical calendar

CREATE TYPE "ObservanceType" AS ENUM (
  'FEAST',
  'HOLY_DAY',
  'SEASON_START',
  'SEASON_END',
  'DIOCESAN_EVENT',
  'OTHER'
);

CREATE TABLE "LiturgicalObservance" (
  "id" UUID NOT NULL,
  "dioceseId" UUID NOT NULL,
  "parishId" UUID,
  "title" TEXT NOT NULL,
  "observanceType" "ObservanceType" NOT NULL DEFAULT 'FEAST',
  "month" INTEGER,
  "day" INTEGER,
  "occursOn" DATE,
  "endsOn" DATE,
  "lectionaryRef" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LiturgicalObservance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiturgicalObservance_dioceseId_isPublished_idx"
  ON "LiturgicalObservance"("dioceseId", "isPublished");

CREATE INDEX "LiturgicalObservance_parishId_occursOn_idx"
  ON "LiturgicalObservance"("parishId", "occursOn");

CREATE INDEX "LiturgicalObservance_dioceseId_month_day_idx"
  ON "LiturgicalObservance"("dioceseId", "month", "day");

ALTER TABLE "LiturgicalObservance"
  ADD CONSTRAINT "LiturgicalObservance_dioceseId_fkey"
  FOREIGN KEY ("dioceseId") REFERENCES "Diocese"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiturgicalObservance"
  ADD CONSTRAINT "LiturgicalObservance_parishId_fkey"
  FOREIGN KEY ("parishId") REFERENCES "Parish"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
