-- Coverage Matrix Cache Table
-- Caches coverage analysis to avoid recalculating

CREATE TABLE coverage_matrix_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product TEXT NOT NULL,
  market TEXT NOT NULL,
  awareness_level TEXT NOT NULL,

  concept_count INTEGER DEFAULT 0,
  live_ad_count INTEGER DEFAULT 0,

  last_tested_at TIMESTAMPTZ,
  performance_summary JSONB,

  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(product, market, awareness_level)
);

-- Indexes
CREATE INDEX idx_coverage_matrix_product ON coverage_matrix_cache(product);
CREATE INDEX idx_coverage_matrix_market ON coverage_matrix_cache(market);
CREATE INDEX idx_coverage_matrix_calculated ON coverage_matrix_cache(calculated_at DESC);

-- RLS
ALTER TABLE coverage_matrix_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for service role"
  ON coverage_matrix_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
