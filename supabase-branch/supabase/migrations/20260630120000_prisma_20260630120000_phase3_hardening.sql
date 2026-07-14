-- GENERATED FILE - DO NOT EDIT.
-- Source: prisma/migrations/20260630120000_phase3_hardening/migration.sql
-- SHA-256: d3e27399764aee4c8803d0ca2e161067a27c2c20524bc5355318590c96029842

-- Phase 3 hardening: claim communications recipients before network delivery.
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
