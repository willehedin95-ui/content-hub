-- Migration: Add RPC for external concept number assignment
-- Date: 2026-03-06
-- Purpose: External concepts (Ron's) use a separate numbering sequence (R001, R002...)
--          so they don't conflict with hub concept numbers (#001, #002...).
--          This RPC atomically assigns the next available external concept number
--          for a given product.
-- Depends on: source column on image_jobs (2026-03-06-launchpad-columns.sql)

CREATE OR REPLACE FUNCTION assign_next_external_concept_number(p_job_id UUID, p_product TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Get max external concept number for this product
  SELECT COALESCE(MAX(concept_number), 0) + 1
  INTO next_num
  FROM image_jobs
  WHERE product = p_product
    AND source = 'external'
    AND concept_number IS NOT NULL;

  -- Assign it
  UPDATE image_jobs
  SET concept_number = next_num
  WHERE id = p_job_id;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;
