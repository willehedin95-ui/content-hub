-- Migration: Add source and launchpad_priority columns to image_jobs
-- Date: 2026-03-06
-- Context: Pipeline redesign — track concept origin and launch pad ordering

-- Add source column with default 'hub'
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'hub';

-- Add launchpad_priority (null = not on launch pad, lower = higher priority)
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS launchpad_priority INTEGER;

-- Index for launch pad queries
CREATE INDEX IF NOT EXISTS idx_image_jobs_launchpad
  ON image_jobs (launchpad_priority)
  WHERE launchpad_priority IS NOT NULL;
