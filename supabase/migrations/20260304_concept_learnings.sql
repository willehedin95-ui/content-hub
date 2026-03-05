-- Concept Learnings: structured learning records from ad testing outcomes
-- Auto-generated when concepts are killed or promoted to active
CREATE TABLE concept_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_job_market_id UUID REFERENCES image_job_markets(id) ON DELETE SET NULL,
  image_job_id UUID REFERENCES image_jobs(id) ON DELETE SET NULL,
  product TEXT NOT NULL,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('winner', 'loser')),
  angle TEXT,
  awareness_level TEXT,
  style TEXT,
  concept_type TEXT,
  days_tested INTEGER,
  total_spend NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC,
  conversions INTEGER,
  cpa NUMERIC,
  roas NUMERIC,
  hypothesis_tested TEXT,
  takeaway TEXT,
  tags TEXT[] DEFAULT '{}',
  signal TEXT,
  concept_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_concept_learnings_product ON concept_learnings(product);
CREATE INDEX idx_concept_learnings_market ON concept_learnings(product, market);
CREATE INDEX idx_concept_learnings_outcome ON concept_learnings(outcome);
CREATE INDEX idx_concept_learnings_angle ON concept_learnings(angle);
