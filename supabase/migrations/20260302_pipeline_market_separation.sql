-- Create image_job_markets table
CREATE TABLE image_job_markets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  image_job_id uuid NOT NULL REFERENCES image_jobs(id) ON DELETE CASCADE,
  market text NOT NULL CHECK (market IN ('SE', 'DK', 'NO', 'DE')),
  meta_campaign_id uuid REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (image_job_id, market)
);

-- Index for fast lookups
CREATE INDEX idx_image_job_markets_image_job_id ON image_job_markets(image_job_id);
CREATE INDEX idx_image_job_markets_market ON image_job_markets(market);
CREATE INDEX idx_image_job_markets_meta_campaign ON image_job_markets(meta_campaign_id);

-- Enable RLS
ALTER TABLE image_job_markets ENABLE ROW LEVEL SECURITY;

-- Service role can do anything
CREATE POLICY "Service role can manage image_job_markets"
  ON image_job_markets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
