-- Populate image_job_markets from existing meta_campaigns
-- Only migrate successfully pushed campaigns (status: 'pushed' or 'pushing')
-- Maps language codes to market codes: sv→SE, da→DK, no→NO, de→DE
INSERT INTO image_job_markets (image_job_id, market, meta_campaign_id, created_at)
SELECT
  image_job_id,
  CASE language
    WHEN 'sv' THEN 'SE'
    WHEN 'da' THEN 'DK'
    WHEN 'no' THEN 'NO'
    WHEN 'de' THEN 'DE'
  END as market,
  id as meta_campaign_id,
  created_at
FROM meta_campaigns
WHERE image_job_id IS NOT NULL
  AND status IN ('pushed', 'pushing')
  AND language IS NOT NULL
ORDER BY created_at ASC
ON CONFLICT (image_job_id, market) DO NOTHING;
