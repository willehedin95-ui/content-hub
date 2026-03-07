-- Video Ads Pipeline: Database Migrations
-- Date: 2026-03-07
-- Task 1 of 10: Add foundational columns for video ad support

-- Step 1: Add columns to video_jobs
-- ad_copy_translations: stores translated ad copy per language (jsonb)
-- landing_page_id: links video job to a landing page
-- ab_test_id: links video job to an A/B test
-- launchpad_priority: ordering priority in the launchpad queue
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS ad_copy_translations jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS landing_page_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_test_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS launchpad_priority integer DEFAULT NULL;

-- Step 2: Add columns to video_translations
-- caption_style: style preset for captions (e.g. 'hormozi', 'minimal')
-- caption_srt_url: URL to the generated SRT subtitle file
-- captioned_video_url: URL to the final video with burned-in captions
ALTER TABLE video_translations
  ADD COLUMN IF NOT EXISTS caption_style text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS caption_srt_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS captioned_video_url text DEFAULT NULL;

-- Step 3: Add format column to meta_campaign_mappings
-- format: distinguishes between 'image' and 'video' ad formats
ALTER TABLE meta_campaign_mappings
  ADD COLUMN IF NOT EXISTS format text DEFAULT 'image';
UPDATE meta_campaign_mappings SET format = 'image' WHERE format IS NULL;

-- Step 4: Add concept_type column to concept_lifecycle
-- concept_type: distinguishes between 'image' and 'video' concepts
ALTER TABLE concept_lifecycle
  ADD COLUMN IF NOT EXISTS concept_type text DEFAULT 'image';
