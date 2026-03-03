-- Hook Library — curated hooks and headlines for AI inspiration + AB test variations
CREATE TABLE hook_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_text TEXT NOT NULL,
  hook_type TEXT NOT NULL DEFAULT 'hook'
    CHECK (hook_type IN ('hook', 'headline', 'native_headline')),
  product TEXT CHECK (product IS NULL OR product IN ('happysleep', 'hydro13')),
  awareness_level TEXT,
  angle TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('manual', 'telegram', 'concept_auto', 'spy_ad')),
  source_concept_id UUID, -- FK to pipeline_concepts(id) added when that table exists
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'approved', 'archived')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hook_library_product ON hook_library(product);
CREATE INDEX idx_hook_library_status ON hook_library(status);
CREATE UNIQUE INDEX idx_hook_library_dedup ON hook_library(hook_text, COALESCE(product, '__universal__'));
