-- Pipeline Concepts Table
-- Stores generated concepts before they become image_jobs

CREATE TABLE pipeline_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Concept metadata
  concept_number INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('happysleep', 'hydro13')),

  -- CASH DNA
  cash_dna JSONB,

  -- Generated content
  headline TEXT NOT NULL,
  primary_copy TEXT[] NOT NULL,
  ad_copy_headline TEXT[] NOT NULL,
  hypothesis TEXT NOT NULL,

  -- Generation context
  generation_mode TEXT,
  generation_batch_id UUID,
  template_id TEXT,

  -- Pipeline status
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN (
      'pending_review',
      'approved',
      'rejected',
      'generating_images',
      'images_complete',
      'scheduled',
      'live'
    )),

  -- Relationships
  image_job_id UUID REFERENCES image_jobs(id) ON DELETE SET NULL,
  rejected_reason TEXT,

  -- Target settings
  target_languages TEXT[] NOT NULL,
  target_markets TEXT[],

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  images_completed_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_pipeline_concepts_status ON pipeline_concepts(status);
CREATE INDEX idx_pipeline_concepts_batch ON pipeline_concepts(generation_batch_id);
CREATE INDEX idx_pipeline_concepts_product ON pipeline_concepts(product);
CREATE INDEX idx_pipeline_concepts_created ON pipeline_concepts(created_at DESC);
CREATE INDEX idx_pipeline_concepts_image_job ON pipeline_concepts(image_job_id);

-- Auto-increment concept_number
CREATE SEQUENCE pipeline_concepts_number_seq START 1;
ALTER TABLE pipeline_concepts
  ALTER COLUMN concept_number
  SET DEFAULT nextval('pipeline_concepts_number_seq');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_concepts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pipeline_concepts_updated_at
  BEFORE UPDATE ON pipeline_concepts
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_concepts_updated_at();

-- RLS policies (if needed)
ALTER TABLE pipeline_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for service role"
  ON pipeline_concepts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
