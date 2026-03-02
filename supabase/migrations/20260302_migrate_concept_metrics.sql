-- Add image_job_market_id column
ALTER TABLE concept_metrics ADD COLUMN IF NOT EXISTS image_job_market_id uuid REFERENCES image_job_markets(id) ON DELETE CASCADE;

-- Delete all existing metrics (we'll re-fetch per-market from Meta)
DELETE FROM concept_metrics;

-- Drop old image_job_id column
ALTER TABLE concept_metrics DROP COLUMN IF EXISTS image_job_id;

-- Make image_job_market_id NOT NULL
ALTER TABLE concept_metrics ALTER COLUMN image_job_market_id SET NOT NULL;

-- Update unique constraint
DROP INDEX IF EXISTS concept_metrics_image_job_id_date_key;
CREATE UNIQUE INDEX concept_metrics_image_job_market_date_key ON concept_metrics(image_job_market_id, date);

-- Add index
CREATE INDEX IF NOT EXISTS idx_concept_metrics_image_job_market ON concept_metrics(image_job_market_id);
