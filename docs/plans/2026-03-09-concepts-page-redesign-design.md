# Concepts Page Redesign

**Date:** 2026-03-09
**Goal:** Transform the Concepts list from a confusing flat table into a clean work queue with thumbnails, simplified status, and manual archiving.

## Pain Points (Current)

1. No thumbnails — can't visually recognize concepts
2. Published concepts clutter the list — old SE-only concepts mixed with active work
3. Status display is confusing — too many columns, unclear where each concept is stuck
4. Redundant columns (Translations column, Kanban toggle)

## Key Decisions

- **Primary use case:** "Find what to work on next" — the page is a work queue
- **Status steps are correct**, display is wrong — keep the wizard pipeline, fix the UI
- **Manual archive** (not auto) — user archives duplicates and truly-done concepts
- **Thumbnails:** first translated image per concept
- **Layout:** table with thumbnail column (not cards, not kanban)
- **Status shows furthest-behind market** — concept stays in work queue until ALL target markets are done
- **Market sync is not a problem** — user will add NO/DK to old SE-only concepts; Launch Pad already handles per-market push independently

## Table Columns

| Column | Width | Content |
|--------|-------|---------|
| Checkbox | 32px | Bulk select (for archive) |
| # | 48px | Concept number |
| Thumbnail | 48px | First translated image, rounded corners. Fallback: source image → grey placeholder |
| Name | flex | Concept name + tag pills below |
| Product | 80px | HappySleep / Hydro13 badge |
| Status | 140px | Single badge showing furthest-behind market's wizard step |
| Markets | 100px | Flag icons — colored = in progress/done, greyed = not started |
| Created | 80px | Relative date ("3d ago") |

**Removed:** Translations column (redundant with new status logic). Kanban board toggle (Ad Tracker serves that purpose).

## Status Logic

Status displays the **earliest incomplete step** across all target markets:

- **Step 1/3 · Images** — at least one market still needs translated images
- **Step 2/3 · Ad Copy** — all images done, ad copy missing for at least one market
- **Step 3/3 · Preview** — ready for review
- **Ready** — approved, can be added to Launch Pad
- **Published** — pushed to Meta for all target markets

## Archive

- Manual archive via per-row action button + bulk action with checkboxes
- Database: `archived_at` timestamp on `image_jobs` (null = active)
- Default view hides archived concepts — clean work queue
- "Show archived" toggle in filter bar — shows only archived with "Unarchive" action
- Fully reversible

## Filters (Simplified)

- **Status tabs:** All | Images | Ad Copy | Preview | Ready | Published
- **Product:** All | HappySleep | Hydro13
- **Search:** by name
- **Tags:** keep current tag filter

## Default Sort

Status priority first (earliest step at top = most work needed), then oldest first within each step. Natural to-do list ordering.

## Database Changes

- Add `archived_at` (timestamp, nullable) column to `image_jobs` table
- All existing queries filter `WHERE archived_at IS NULL` by default

## Thumbnail Source

Query: for each concept, fetch the first `source_images` row (by `processing_order`), then its first completed `image_translations` row. Use `translated_url` as thumbnail. Fallback chain: translated_url → source_image.original_url → grey placeholder.

Consider caching thumbnail URL on the `image_jobs` row itself to avoid the join on every list load.
