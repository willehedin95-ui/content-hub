ALTER TABLE translations ADD COLUMN IF NOT EXISTS quality_score numeric;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS quality_analysis jsonb;
