-- Add workspace_id column to auto_paused_ads table
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/fbpefeqqqfrcmfmjmeij/sql/new
ALTER TABLE auto_paused_ads ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
