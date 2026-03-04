# Copy Bank — Design

**Goal:** Save and reuse best-performing translated ad copies per market, tagged by product segment, so the same proven copy can be applied to new concepts without re-translating.

**Problem:** Ad copy is written in English and translated per-language each push. The same English text produces slightly different translations every time, so proven winners get lost. No way to reuse a known-good Swedish primary text on a different concept.

## Database

New table `copy_bank`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | default gen_random_uuid() |
| `product` | text NOT NULL | FK to products.slug ("happysleep", "hydro13") |
| `language` | text NOT NULL | "sv", "no", "da" |
| `primary_text` | text NOT NULL | The translated primary text |
| `headline` | text | The translated headline |
| `segment_id` | uuid | FK to product_segments.id (snoring, neck pain, etc.) |
| `source_meta_ad_id` | uuid | FK to meta_ads.id — which pushed ad this came from |
| `source_concept_name` | text | Denormalized for display (e.g. "#042 Sleep Revolution") |
| `notes` | text | Optional user notes |
| `created_at` | timestamptz | default now() |

Unique constraint on `(product, language, primary_text)` to prevent duplicates.

RLS: service role only (internal tool, no public access).

## Auto-suggest via Morning Brief

The morning brief already identifies **winners** (ads with strong ROAS, running 5+ days). When a winner's copy is not already in the copy bank, the brief generates a new action card type: **"Save winning copy"**.

The card shows the translated primary text preview + language + segment. Tapping it calls a new API endpoint that creates the `copy_bank` row. Segment is pre-filled from the source concept's CASH DNA or product_segments.

No background cron — piggybacks on existing morning brief analysis.

## Reuse in ConceptAdCopyStep

Each per-language translation card gets a **"Pick from Copy Bank"** button. Opens a small picker modal showing saved copies for that product + language, filterable by segment chip buttons.

Selecting a copy replaces `ad_copy_translations[language].primary_texts[0]` and `.headlines[0]` on the concept, same as a manual edit. The user can still tweak it after picking.

## API Routes

- `GET /api/copy-bank?product=X&language=Y&segment_id=Z` — List saved copies (filterable)
- `POST /api/copy-bank` — Save a copy to the bank (from Morning Brief action or manual)
- `DELETE /api/copy-bank/[id]` — Remove a saved copy

## UI Touchpoints

1. **Morning Brief** — "Save winning copy" action card (auto-suggested from winners)
2. **ConceptAdCopyStep** — "Pick from Copy Bank" button per language card, opens picker
3. **No standalone page** — managed inline for now; can add `/copy-bank` browse page later if list grows

## Not in Scope

- Standalone `/copy-bank` browse/manage page (later if needed)
- Manual copy entry (user said "from pushed ads only")
- Performance metrics on bank entries (can add later)
- English copy bank (only translated copies are banked)
