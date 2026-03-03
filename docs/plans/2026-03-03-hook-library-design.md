# Hook Library Design

## Problem

AI-generated hooks/headlines are good but could be better with proven examples as inspiration. There's no way to collect, curate, or reuse winning hooks. AB testing landing page headlines requires manual translation work.

## Use Cases

1. **Better AI output** — Feed proven hooks into brainstorm prompts so Claude generates higher-quality concepts
2. **Quick AB test variations** — Select a headline in the page editor, click "generate variation", get a translated alternative instantly
3. **Manual collection** — Save hooks found online via Telegram bot or hub UI

## Data Model

```sql
CREATE TABLE hook_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  hook_text TEXT NOT NULL,
  hook_type TEXT NOT NULL DEFAULT 'hook', -- 'hook' | 'headline' | 'native_headline'

  -- Classification
  product TEXT,                         -- 'happysleep' | 'hydro13' | NULL (universal)
  awareness_level TEXT,                 -- From CASH framework, nullable
  angle TEXT,                           -- From CASH framework, nullable
  tags TEXT[] DEFAULT '{}',             -- Free-form tags

  -- Source tracking
  source TEXT NOT NULL,                 -- 'manual' | 'telegram' | 'concept_auto' | 'spy_ad'
  source_concept_id UUID REFERENCES pipeline_concepts(id),
  source_url TEXT,                      -- URL where hook was found

  -- Curation
  status TEXT NOT NULL DEFAULT 'unreviewed', -- 'unreviewed' | 'approved' | 'archived'
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hook_library_product ON hook_library(product);
CREATE INDEX idx_hook_library_status ON hook_library(status);
```

Key decisions:
- `product` nullable for universal hooks
- `status` defaults to `unreviewed` for concept auto-adds, `approved` for manual adds
- `hook_type` distinguishes scroll-stopping hooks vs short headlines vs editorial native headlines
- Duplicate prevention: unique on `(hook_text, product)` — same hook can exist for different products

## Feature 1: Hook Bank UI (`/hooks`)

**Sidebar location:** "Ads" group (alongside Brainstorm, Ad Concepts, Ad Spy)

**Page layout:**
- **Top bar:** Quick-add form — text input + product dropdown + type dropdown + "Add" button. Always visible.
- **Filters:** Product | Type | Status | Awareness Level | Source — horizontal filter chips
- **Main list:** Cards showing hook text, tags as chips, status badge, quick actions (approve/archive/edit/delete)
- **Bulk actions:** Multi-select → bulk approve/archive

No detail page — hooks are short, manage inline. Edit opens inline or small modal.

## Feature 2: Auto-Population from Approved Concepts

**Trigger:** When concept status changes to `approved` in the pipeline.

**Logic:**
1. Extract hooks from `cash_dna.hooks[]` → insert as `hook_type: 'hook'`
2. Extract headlines from `ad_copy_headline[]` → insert as `hook_type: 'headline'`
3. Set `source: 'concept_auto'`, `status: 'unreviewed'`, link via `source_concept_id`
4. Copy product, awareness_level, angle from concept
5. Skip duplicates (match on `hook_text` + `product`)

**Where:** Modify the existing approve-concept API route.

## Feature 3: Telegram Collection

**Detection:** When bot receives plain text (no URL), treat as hook to save.

**Flow:**
1. User sends hook text to Telegram bot
2. Bot saves to `hook_library` with `source: 'telegram'`, `status: 'approved'`
3. Bot replies with inline keyboard: "HappySleep" | "Hydro13" | "Universal"
4. User taps product → bot updates the record
5. Bot confirms: "Saved to hook bank"

URL messages continue existing behavior (ad scraping) unchanged.

## Feature 4: Brainstorm Prompt Injection

**Location in prompt:** Between product context and output instructions in `brainstorm.ts`.

**Injected section:**
```
## PROVEN HOOKS — USE AS INSPIRATION (DO NOT COPY)
These hooks have been curated from winning concepts. Use them to understand
what tone and patterns work, but create ORIGINAL hooks for each new concept.

### HappySleep hooks:
- "The forgotten mineral 9 out of 10 Scandinavians are missing"
- "Why your pillow is silently ruining your mornings"
...

### Universal hooks:
- "Doctors in Norway are finally talking about this"
...
```

**Query:** Top ~20 approved hooks for the product + universal, newest first. Only `status: 'approved'`. Truncate to prevent prompt bloat.

## Feature 5: Page Editor "Generate Variation"

**UI:** When user selects a text element in the page editor (`EditPageClient.tsx`):
- New button in editor toolbar: "Generate Variation"
- Click opens popover with two modes:
  - **Rewrite** — same meaning, different words/phrasing
  - **Hook bank inspired** — completely different headline based on proven hooks from bank
- Result replaces selected text inline. Undo via Ctrl+Z.

**API:** `POST /api/hooks/generate-variation`
- Input: `{ text, language, product, mode: 'rewrite' | 'hook_inspired' }`
- "Rewrite" mode: Claude rewrites with different phrasing, outputs in target language
- "Hook inspired" mode: Query hook bank → send top hooks as context → Claude creates new headline inspired by bank, outputs in target language
- Uses existing Claude/OpenAI integration for generation

## Integration Points

| System | Integration |
|--------|------------|
| Brainstorm (`brainstorm.ts`) | Query approved hooks → inject into system prompt |
| Pipeline approve route | Auto-add hooks from approved concepts |
| Page editor (`EditPageClient.tsx`) | "Generate Variation" button + popover |
| Telegram bot webhook | Detect plain text → save as hook |
| Sidebar (`layout.tsx`) | Add `/hooks` to "Ads" group |
