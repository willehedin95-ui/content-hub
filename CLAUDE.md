# Claude Code Instructions

## After completing changes

Always commit and push changes to the `main` branch after finishing a task. The project auto-deploys to Vercel on push.

## Tech stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, light theme (`bg-gray-50` base, `bg-white` cards, `border-gray-200` borders, indigo-600 primary)
- **Database**: Supabase (PostgreSQL) — server-side uses `createServerSupabase()` with service role key
- **Storage**: Supabase Storage `translated-images` bucket for all uploaded/generated images
- **APIs**: OpenAI GPT-4o (text translation + quality analysis), Kie AI nano-banana-pro (image translation), Netlify (publishing), Google Drive (service account import/export), Resend (email notifications)
- **Icons**: lucide-react
- **Build**: `npm run build` — always verify build passes before committing

## Project structure

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components organized by section (`layout/`, `dashboard/`, `pages/`, `images/`, `ad-copy/`)
- `src/lib/` — Server utilities (supabase, openai, kie, netlify, html-parser, quality-analysis, google-drive, email, pricing, etc.)
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

Tables: `pages`, `translations`, `ab_tests`, `usage_logs`, `image_jobs`, `source_images`, `image_translations`, `versions`, `ad_copy_jobs`, `ad_copy_translations`

## Features

- **Landing pages** (dashboard): List/filter pages, translation status per language
- **Import**: Modal on dashboard — fetch URL (Puppeteer) or upload HTML file
- **Editor**: Iframe-based WYSIWYG with inline text editing, image translation, SEO controls, per-language slugs
- **Publishing**: Deploy to Netlify with image optimization (WebP), A/B testing with split routing
- **Static ads**: Batch image translation — upload files or import from Google Drive, translate via Kie AI to sv/da/no/de, multi-version system with AI quality analysis (GPT-4o vision), auto-retry when score below threshold (max 5 versions), auto-export to Drive, email notifications (Resend), recovery system (auto-resume + watchdog + stall banner), export as ZIP
- **Ad copy**: Text translation — paste ad copy, translate to multiple languages via GPT-4o with quality analysis, side-by-side results
- **Settings**: Configurable quality threshold, default languages, economy mode, notification email, Kie AI credit balance
