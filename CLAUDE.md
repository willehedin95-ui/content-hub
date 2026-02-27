# Claude Code Instructions

## After completing changes

Always commit changes after finishing a task and push to `main`. The project auto-deploys to Vercel on push.

**When pushing to Vercel**: Always tell the user the git short hash of the pushed commit (e.g. `508b6dd`) so they can verify the deploy is live by checking the version shown in the sidebar footer.

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
- **APIs**: OpenAI GPT-4o (text translation + quality analysis), Kie AI nano-banana-2 (image translation), Anthropic Claude (page swiper copywriting), Cloudflare Pages (publishing via direct upload API), Google Drive (service account import/export), Resend (email notifications), Meta Marketing API v22.0 (ad campaign management)
- **Icons**: lucide-react
- **Build**: `npm run build` — always verify build passes before committing

## Project structure

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components organized by section (`layout/`, `dashboard/`, `pages/`, `images/`, `ad-copy/`, `meta-ads/`, `import/`, `ui/`)
- `src/lib/` — Server utilities (supabase, openai, kie, cloudflare-pages, meta, html-parser, quality-analysis, google-drive, email, pricing, localization, validation, etc.)
- `src/types/index.ts` — All TypeScript types and constants (LANGUAGES, PRODUCTS, PAGE_TYPES)

## Key patterns

- API routes use `{ params }: { params: Promise<{ id: string }> }` (Next.js 15 async params)
- Server components fetch data, pass to client components for interactivity
- Long-running API routes (Kie AI) need `export const maxDuration = 180`
- File uploads go through API routes to Supabase Storage; resize large images client-side to avoid body size limits
- Translation rules are in `src/lib/translation-rules.ts` — shared across all language prompts
- Localization constants (brand names, cultural rules) in `src/lib/localization.ts`
- Usage/costs are logged to `usage_logs` table for every API call (OpenAI tokens, Kie AI images)
- Settings stored in `localStorage` (`content-hub-settings` key) — read with `getSettings()` helper
- Languages: sv (Swedish), da (Danish), no (Norwegian), de (German) — German has no landing page domain, only used for static ads
- Google Drive uses service account auth via `GDRIVE_SERVICE_ACCOUNT_EMAIL` and `GDRIVE_PRIVATE_KEY` env vars

## Database

Schema changes use the Supabase Management API — no migration tool. Run DDL via:
```
curl -X POST "https://api.supabase.com/v1/projects/<project-ref>/database/query" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "SQL here"}'
```

Tables: `pages`, `translations`, `ab_tests`, `usage_logs`, `image_jobs`, `source_images`, `image_translations`, `versions`, `ad_copy_jobs`, `ad_copy_translations`, `meta_campaigns`, `meta_ads`, `meta_campaign_mappings`, `meta_page_configs`, `market_product_urls`, `cf_pages_manifests`, `products`, `product_images`, `copywriting_guidelines`, `reference_pages`

## Hosting & domains

- **App hosting**: Vercel (auto-deploys on push to `main`)
- **Landing page hosting**: Cloudflare Pages (direct upload API, free unlimited deploys)
  - `halsobladet-blog` → blog.halsobladet.com (Swedish)
  - `smarthelse` → smarthelse.dk (Danish)
  - `helseguiden` → helseguiden.com (Norwegian)
- **DNS**: Cloudflare manages DNS for smarthelse.dk and helseguiden.com; Hostinger manages halsobladet.com (subdomain CNAME)
- **Domain registrar**: Hostinger (all three domains)
- **Publishing code**: `src/lib/cloudflare-pages.ts` — `publishPage()`, `publishABTest()`
- **Manifest tracking**: `cf_pages_manifests` table tracks path→hash per project for incremental uploads

## Features

- **Landing pages** (dashboard): List/filter pages, translation status per language
- **Import**: Modal on dashboard — fetch URL (Puppeteer) or upload HTML file
- **Editor**: Iframe-based WYSIWYG with inline text editing, image translation (non-blocking/fire-and-forget), SEO controls, per-language slugs, element-level spacing/visibility controls
- **Publishing**: Deploy to Cloudflare Pages with image optimization (WebP), A/B testing with split routing
- **Image translation**: Both single-image (editor sidebar, fire-and-forget) and bulk (modal with batch progress tracking in DB). Background translations continue even if user navigates away — progress tracked via `image_status`/`images_done`/`images_total` columns on `translations` table, polled via `/api/translations/[id]/image-status`
- **Concepts**: Batch image translation — upload files or import from Google Drive, translate via Kie AI to sv/da/no/de, multi-version system with AI quality analysis (GPT-4o vision), auto-retry when score below threshold (max 5 versions), auto-export to Drive, email notifications (Resend), recovery system (auto-resume + watchdog + stall banner), export as ZIP
- **Ad copy**: Text translation — paste ad copy, translate to multiple languages via GPT-4o with quality analysis, side-by-side results
- **Concepts — aspect ratios**: Each image job can target multiple ratios (1:1, 9:16, 4:5) alongside multiple languages. Creates one `image_translation` per (language, ratio) combo. Stored as `target_ratios` on `image_jobs` and `aspect_ratio` on `image_translations`.
- **Meta Ads — Concept Push**: From the concept detail page's "Preview & Push" tab, push translated image ads to Meta. Per target language: duplicates a template ad set, uploads 1:1 images, creates ad creatives (`object_story_spec`), creates ads with `image_cropping: OPT_OUT` (prevents auto-crop on stories/reels). Ad set naming: `"{COUNTRY} #{number} | statics | {name}"` (concept `#XXX` prefix stripped). Template ad sets + campaign mappings configured in Settings (`meta_campaign_mappings`, `meta_page_config` tables). Tracks state in `meta_campaigns`/`meta_ads`. Uses System User token via `src/lib/meta.ts`. Env vars: `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`.
- **Meta Ads — Campaign Builder**: Standalone campaign builder at `/meta-ads` for manual campaign creation (separate from concept push).
- **Product Bank** (`/products`): Rich product database with info, images, copywriting guidelines, and reference pages. Replaces the simple product enum with full product profiles. Tables: `products`, `product_images`, `copywriting_guidelines`, `reference_pages`.
- **Page Swiper** (`/swiper`): Paste a competitor URL → Puppeteer fetches it → Claude (Anthropic) rewrites all copy for a selected product using product bank context → manual image replacement from product bank → save as new page in hub. Code: `src/lib/claude.ts` wraps Anthropic API with dynamic system prompt built from product bank data. Env var: `ANTHROPIC_API_KEY`.
- **Settings**: Configurable quality threshold, default languages, economy mode, notification email, Kie AI credit balance, Meta Ads connection test

## Hard constraints (NEVER do these)

- **NEVER push to main without user confirmation** — The project auto-deploys to Vercel. An accidental push deploys broken code instantly.
- **NEVER run `git add -A` or `git add .`** — Stage specific files only. This project has `.env` files, credentials, and large binaries that must never be committed.
- **NEVER run multiple dev servers** — Always check `lsof -i :3000` before starting. Multiple servers cause system-wide slowdowns.
- **NEVER guess API endpoints or parameters** — Read the actual code in `src/lib/` before making API calls. Meta, Supabase, Cloudflare, and Kie all have non-obvious behaviors.
- **NEVER use the Supabase service role key for DDL** — It only supports PostgREST (data operations). Schema changes MUST go through the Management API.
- **NEVER set `is_dynamic_creative` on an existing Meta ad set** — It can only be set at creation time. Meta silently ignores the update.
- **NEVER skip `npm run build`** — Always verify the build passes before committing. TypeScript errors caught here prevent broken deploys.
- **NEVER create files at the project root unless they're config files** — Components go in `src/components/`, utilities in `src/lib/`, types in `src/types/`.
- **NEVER hardcode API tokens in source files** — All tokens live in `.env.local`. Reference via `process.env.VARIABLE_NAME`.
- **NEVER modify the Supabase service role key or project URL** — These are shared infrastructure. If they look wrong, ask before changing.

## Session continuity

At the start of a session, check `.claude/journal/LATEST.md` and `.claude/tasks/backlog.md` for context from previous sessions. This prevents wasting time re-establishing what was already done.

At the end of a session, run `/wrap-up` to commit code, journal what happened, and update memory.

## Product context

The owner is a solopreneur running an ecommerce store (HappySleep, Hydro13 brands) selling to Norway and Denmark. A freelancer (Ron) creates English landing pages, static image ads, and ad copy. This hub is the internal tool for:
1. Translating content to Norwegian/Danish/Swedish (and German for static ads only)
2. Publishing translated landing pages to per-language Cloudflare Pages sites
3. A/B testing landing page variants
4. Translating static image ads via AI with quality control
5. Translating ad copy text
6. Pushing assembled campaigns (images + copy + landing page URLs) to Meta Ads Manager
7. Swiping competitor pages — rewriting copy for our products using Claude AI

The vision is to eliminate manual export/download/upload workflows — everything flows from Ron's English originals through translation to ad platform deployment in one tool. Google Ads integration is planned for a later stage.
