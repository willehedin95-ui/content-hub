-- Add product column to image_jobs
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS product text;

-- Add product column to ad_copy_jobs
ALTER TABLE ad_copy_jobs ADD COLUMN IF NOT EXISTS product text;

-- Create campaign mapping table
CREATE TABLE IF NOT EXISTS meta_campaign_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product text NOT NULL,
  country text NOT NULL,
  meta_campaign_id text NOT NULL,
  meta_campaign_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product, country)
);
