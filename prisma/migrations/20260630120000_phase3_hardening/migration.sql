-- Phase 3 hardening: claim communications recipients before network delivery.
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
