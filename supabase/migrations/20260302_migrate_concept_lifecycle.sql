-- Add image_job_market_id column (nullable initially)
ALTER TABLE concept_lifecycle ADD COLUMN IF NOT EXISTS image_job_market_id uuid REFERENCES image_job_markets(id) ON DELETE CASCADE;

-- Make image_job_id nullable temporarily to allow new records without it
ALTER TABLE concept_lifecycle ALTER COLUMN image_job_id DROP NOT NULL;

-- Populate image_job_market_id from existing image_job_id
-- For each lifecycle record, create a copy for each market that concept was pushed to
--
-- IMPORTANT: This uses INNER JOIN (not LEFT JOIN) by design.
-- Only concepts that have been pushed to Meta markets (i.e., have image_job_markets records)
-- will have their lifecycle migrated. Concepts in draft/ready/processing states that haven't
-- been pushed yet will NOT have their lifecycle migrated, which is correct behavior because:
-- 1. Pipeline market separation tracks concepts AFTER they're pushed to Meta
-- 2. Pre-push lifecycle data (generation, review) isn't relevant to per-market tracking
-- 3. When those concepts do get pushed, they'll create fresh lifecycle entries from "testing" stage
WITH lifecycle_markets AS (
  SELECT
    cl.id as lifecycle_id,
    cl.image_job_id,
    cl.stage,
    cl.entered_at,
    cl.exited_at,
    cl.signal,
    cl.notes,
    ijm.id as image_job_market_id
  FROM concept_lifecycle cl
  JOIN image_job_markets ijm ON ijm.image_job_id = cl.image_job_id
)
INSERT INTO concept_lifecycle (image_job_market_id, stage, entered_at, exited_at, signal, notes)
SELECT
  image_job_market_id,
  stage,
  entered_at,
  exited_at,
  signal,
  notes
FROM lifecycle_markets
ON CONFLICT DO NOTHING;

-- Delete old records that don't have image_job_market_id
DELETE FROM concept_lifecycle WHERE image_job_market_id IS NULL;

-- Drop old image_job_id column
ALTER TABLE concept_lifecycle DROP COLUMN IF EXISTS image_job_id;

-- Make image_job_market_id NOT NULL
ALTER TABLE concept_lifecycle ALTER COLUMN image_job_market_id SET NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_concept_lifecycle_image_job_market ON concept_lifecycle(image_job_market_id);
