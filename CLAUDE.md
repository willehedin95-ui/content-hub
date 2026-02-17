# Claude Code Instructions

## After completing changes

Always commit changes after finishing a task. **Do NOT push to `main` automatically** — the project auto-deploys to Vercel on push, and each deploy costs credits. Instead:

1. Start the dev server (`npm run dev`) so the user can preview changes locally
2. Only push to `main` when the user explicitly confirms the changes look good

This saves deploy credits by catching issues locally before triggering a production build.

## Dev server management

**Only one dev server at a time.** Before starting a new dev server:

1. Check for any already-running dev servers (`lsof -i :3000` or check for running node/next processes)
2. Kill any existing dev server before starting a new one
3. Never leave dev servers running in the background — stop them when done

Multiple concurrent dev servers have caused system performance issues in the past. Always be aware of what's running.

## Tech stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, light theme (`bg-gray-50` base, `bg-white` cards, `border-gray-200` borders, indigo-600 primary)
- **Database**: Supabase (PostgreSQL) — server-side uses `createServerSupabase()` with service role key
- **Storage**: Supabase Storage `translated-images` bucket for all uploaded/generated images
- **APIs**: OpenAI GPT-4o (text translation + quality analysis), Kie AI nano-banana-pro (image translation), Netlify (publishing), Google Drive (service account import/export), Resend (email notifications), Meta Marketing API v22.0 (ad campaign management)
- **Icons**: lucide-react
- **Build**: `npm run build` — always verify build passes before committing

## Project structure

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components organized by section (`layout/`, `dashboard/`, `pages/`, `images/`, `ad-copy/`, `meta-ads/`)
- `src/lib/` — Server utilities (supabase, openai, kie, netlify, meta, html-parser, quality-analysis, google-drive, email, pricing, etc.)
- `src/types/index.ts` — All TypeScript types and constants (LANGUAGES, PRODUCTS, PAGE_TYPES)

## Key patterns

- API routes use `{ params }: { params: Promise<{ id: string }> }` (Next.js 15 async params)
- Server components fetch data, pass to client components for interactivity
- Long-running API routes (Kie AI) need `export const maxDuration = 180`
- File uploads go through API routes to Supabase Storage; resize large images client-side to avoid body size limits
- Translation rules are in `src/lib/translation-rules.ts` — shared across all language prompts
- Usage/costs are logged to `usage_logs` table for every API call (OpenAI tokens, Kie AI images)
- Settings stored in `localStorage` (`content-hub-settings` key) — read with `getSettings()` helper
- Languages: sv (Swedish), da (Danish), no (Norwegian), de (German) — German has no landing page domain, only used for static ads
- Google Drive uses service account auth via `GDRIVE_SERVICE_ACCOUNT_EMAIL` and `GDRIVE_PRIVATE_KEY` env vars

## Database

Schema changes require manual SQL in the Supabase dashboard — there is no migration tool. Always provide the SQL to the user when adding new tables/columns.

Tables: `pages`, `translations`, `ab_tests`, `usage_logs`, `image_jobs`, `source_images`, `image_translations`, `versions`, `ad_copy_jobs`, `ad_copy_translations`, `meta_campaigns`, `meta_ads`

## Features

- **Landing pages** (dashboard): List/filter pages, translation status per language
- **Import**: Modal on dashboard — fetch URL (Puppeteer) or upload HTML file
- **Editor**: Iframe-based WYSIWYG with inline text editing, image translation, SEO controls, per-language slugs
- **Publishing**: Deploy to Netlify with image optimization (WebP), A/B testing with split routing
- **Static ads**: Batch image translation — upload files or import from Google Drive, translate via Kie AI to sv/da/no/de, multi-version system with AI quality analysis (GPT-4o vision), auto-retry when score below threshold (max 5 versions), auto-export to Drive, email notifications (Resend), recovery system (auto-resume + watchdog + stall banner), export as ZIP
- **Ad copy**: Text translation — paste ad copy, translate to multiple languages via GPT-4o with quality analysis, side-by-side results
- **Static ads — aspect ratios**: Each image job can target multiple ratios (1:1, 9:16, 4:5) alongside multiple languages. Creates one `image_translation` per (language, ratio) combo. Stored as `target_ratios` on `image_jobs` and `aspect_ratio` on `image_translations`.
- **Meta Ads**: Push translated ads directly to Meta Ads Manager. Three-step wizard: Setup (name, objective, market, budget) → Select Assets (pick images, ad copy, landing pages from hub) → Review & Create. Creates campaign + ad set + ads in Meta as Paused. Tracks push state locally in `meta_campaigns`/`meta_ads` tables. Uses System User token (long-lived) via `src/lib/meta.ts`. Env vars: `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`.
- **Settings**: Configurable quality threshold, default languages, economy mode, notification email, Kie AI credit balance, Meta Ads connection test

## Product context

The owner is a solopreneur running an ecommerce store (HappySleep, Hydro13 brands) selling to Norway and Denmark. A freelancer (Ron) creates English landing pages, static image ads, and ad copy. This hub is the internal tool for:
1. Translating content to Norwegian/Danish/Swedish (and German for static ads only)
2. Publishing translated landing pages to per-language Netlify sites
3. A/B testing landing page variants
4. Translating static image ads via AI with quality control
5. Translating ad copy text
6. Pushing assembled campaigns (images + copy + landing page URLs) to Meta Ads Manager

The vision is to eliminate manual export/download/upload workflows — everything flows from Ron's English originals through translation to ad platform deployment in one tool. Google Ads integration is planned for a later stage.
