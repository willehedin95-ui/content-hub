# A/B Test Creation Modes

**Date**: 2026-03-02
**Status**: Approved

## Overview

Add a mode selector to the A/B test creation form offering two test types:
1. **Compare two pages** — the existing flow (pick two different translations)
2. **Test variation of one page** — pick one translation, duplicate it, then edit the copy in the full page editor

## UX Flow

Mode selector — two cards/tabs at the top of `/ab-tests/new`:

### Compare Two Pages
- "Test two completely different pages against each other"
- Variant A: dropdown to pick any translation
- Variant B: dropdown to pick a different translation
- After submit: goes to test detail page (existing behavior)

### Test Variation
- "Duplicate a page and tweak headline, hero image, or other elements"
- Source page: dropdown to pick any translation (becomes control/Variant A)
- Variant B: auto-created on submit (full duplicate of source)
- After submit: creates duplicate translation → redirects to page editor for the duplicate → user edits and returns to test detail

## Data Model

**No schema changes needed.** The duplicate is a full row in `translations` with:
- Same `page_id` and `language` as the source
- Copied `translated_html`, `seo_title`, `seo_description`
- Status set to `"draft"`

The `ab_tests` table already stores `control_id` and `variant_id` as translation references — works identically for both modes.

## API Changes

### New: `POST /api/translations/[id]/duplicate`
- Copies the translation row (HTML, SEO fields, same page_id + language)
- Returns the new translation ID
- Used by the "Test Variation" mode during form submission

### Modified: `POST /api/ab-tests`
- Add optional `mode` field: `"compare"` | `"variation"` (default `"compare"`)
- When `mode === "variation"`: accept only `control_id` (no `variant_id`), call duplicate internally, set `variant_id` to the new copy
- Returns the created test + the new variant translation ID so the UI can redirect to the editor

## UI Changes

### `NewABTestClient.tsx`
- Add mode toggle (two styled cards) above the form
- "Compare" mode: existing two-dropdown behavior (unchanged)
- "Variation" mode: single dropdown for source page, Variant B section replaced with label ("Will be duplicated from Variant A")
- Submit button text changes: "Create Test" vs "Create & Edit Variant"

### Post-creation redirect (Variation mode)
- After API returns, redirect to page editor for the new duplicate translation
- Add query param or toast indicating "Edit your variant, then go back to publish the test"
