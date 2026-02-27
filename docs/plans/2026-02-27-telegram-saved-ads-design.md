# Telegram Bot + Saved Ads

## Problem

When scrolling Instagram/Facebook on phone, there's no quick way to capture interesting ads and get them into the Content Hub for analysis and concept creation.

## Solution

A Telegram bot that receives ad URLs (or screenshots) and automatically scrapes, stores, and CASH-analyzes them. Analyzed ads appear in a new "Saved Ads" section in the Hub where concepts can be generated from them.

## User Flow

1. Find ad on Instagram/Facebook while scrolling on phone
2. Copy the ad/post URL (or take a screenshot if URL isn't available)
3. Send URL (or screenshot + optional notes) to the Content Hub Telegram bot
4. Bot replies "Scraping..." → scrapes media + text + link via Apify
5. Bot runs CASH analysis (GPT-5.2 with vision)
6. Bot replies with CASH summary (angle, awareness level, hook, link to Hub)
7. Ad appears in "Saved Ads" section in the Hub
8. From Hub: "Generate Concepts" → same ConceptGeneratorModal flow as Ad Spy

Screenshot fallback: Bot receives image → stores in Supabase Storage → runs CASH analysis on image → saves with any accompanying text as notes.

## Database

New table `saved_ads`:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| source_url | text | Original Instagram/Facebook URL |
| source_platform | text | 'instagram' / 'facebook' / 'unknown' |
| media_url | text | Image/video URL in Supabase Storage |
| media_type | text | 'image' / 'video' |
| thumbnail_url | text | For videos |
| headline | text | Ad headline if available |
| body | text | Ad body text |
| destination_url | text | Where the ad links to |
| brand_name | text | Detected or user-provided |
| cash_analysis | jsonb | Same structure as spy_ads |
| analyzed_at | timestamptz | When CASH analysis completed |
| user_notes | text | Text sent alongside URL/screenshot |
| is_bookmarked | boolean | Default false |
| telegram_message_id | text | Reference to Telegram message |
| raw_scrape_data | jsonb | Full Apify response |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## Architecture

### Telegram Webhook

```
POST /api/telegram/webhook
  → Validate Telegram signature
  → Detect: URL message or photo?
  → URL path:
      → Detect platform (instagram.com / facebook.com)
      → Reply "Scraping..."
      → Run Apify actor for platform
      → Save media to Supabase Storage
      → Insert into saved_ads
      → Run CASH analysis
      → Reply with summary + Hub link
  → Screenshot path:
      → Download photo from Telegram
      → Upload to Supabase Storage
      → Insert into saved_ads
      → Run CASH analysis on image
      → Reply with summary + Hub link
```

### API Routes

- `POST /api/telegram/webhook` — Telegram message handler
- `GET /api/saved-ads` — List with filters (platform, bookmarked, search)
- `POST /api/saved-ads/[id]/analyze` — Re-run CASH analysis
- `POST /api/saved-ads/[id]/generate-concepts` — Concept generation (reuses concept-generator.ts)
- `DELETE /api/saved-ads/[id]` — Delete a saved ad

### New Files

- `src/lib/telegram.ts` — Bot utilities (send message, parse updates, download photos)
- `src/app/api/telegram/webhook/route.ts` — Webhook handler
- `src/app/api/saved-ads/route.ts` — List endpoint
- `src/app/api/saved-ads/[id]/analyze/route.ts` — CASH analysis
- `src/app/api/saved-ads/[id]/generate-concepts/route.ts` — Concept generation
- `src/app/saved-ads/page.tsx` — Saved Ads page
- `src/components/saved-ads/SavedAdsDashboard.tsx` — Main dashboard
- `src/components/saved-ads/SavedAdCard.tsx` — Card component
- `src/components/saved-ads/SavedAdDetail.tsx` — Detail panel with CASH + concept generator

### Sidebar

```
▼ Ads
  └─ Brainstorm
  └─ Ad Concepts
  └─ Ad Spy
  └─ Saved Ads  ← NEW
```

## Technical Decisions

- **URL scraping**: Apify actors for Instagram/Facebook post scraping (already integrated)
- **Bot hosting**: Webhook to existing Next.js API routes on Vercel (zero new infrastructure)
- **CASH analysis**: Same GPT-5.2 vision flow as spy ads
- **Concept generation**: Reuses ConceptGeneratorModal from Ad Spy
- **Media storage**: Supabase Storage (same bucket as translated images)

## Environment Variables

- `TELEGRAM_BOT_TOKEN` — From @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — For signature validation

## Telegram Bot Setup

1. Create bot via @BotFather
2. Set bot token in env vars
3. Register webhook: `POST https://api.telegram.org/bot<token>/setWebhook?url=<domain>/api/telegram/webhook&secret_token=<secret>`
