-- Add pipeline_concept_id to image_jobs
-- Links image_jobs back to generating concept

ALTER TABLE image_jobs
ADD COLUMN pipeline_concept_id UUID REFERENCES pipeline_concepts(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX idx_image_jobs_pipeline_concept ON image_jobs(pipeline_concept_id);
