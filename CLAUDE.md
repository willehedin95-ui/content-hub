# Claude Code Instructions

## After completing changes

Always commit and push changes to the `main` branch after finishing a task. The project auto-deploys to Vercel on push.

## Tech stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, dark theme (`bg-[#0a0c14]` base, `#141620` cards, `#1e2130` borders, indigo primary)
- **Database**: Supabase (PostgreSQL) — server-side uses `createServerSupabase()` with service role key
- **Storage**: Supabase Storage `translated-images` bucket for all uploaded/generated images
- **APIs**: OpenAI GPT-4o (text translation), Kie AI nano-banana-pro (image translation), Netlify (publishing)
- **Icons**: lucide-react
- **Build**: `npm run build` — always verify build passes before committing

## Project structure

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — React components organized by section (`layout/`, `dashboard/`, `pages/`, `images/`)
- `src/lib/` — Server utilities (supabase, openai, kie, netlify, html-parser, etc.)
- `src/types/index.ts` — All TypeScript types and constants (LANGUAGES, PRODUCTS, PAGE_TYPES)

## Key patterns

- API routes use `{ params }: { params: Promise<{ id: string }> }` (Next.js 15 async params)
- Server components fetch data, pass to client components for interactivity
- Long-running API routes (Kie AI) need `export const maxDuration = 180`
- File uploads go through API routes to Supabase Storage; resize large images client-side to avoid body size limits
- Translation rules are in `src/lib/translation-rules.ts` — shared across all language prompts
- Usage/costs are logged to `usage_logs` table for every API call (OpenAI tokens, Kie AI images)

## Database

Schema changes require manual SQL in the Supabase dashboard — there is no migration tool. Always provide the SQL to the user when adding new tables/columns.

Tables: `pages`, `translations`, `ab_tests`, `usage_logs`, `image_jobs`, `source_images`, `image_translations`

## Features

- **Dashboard**: List/filter pages, translation status per language
- **Import**: Fetch URL (Puppeteer) or upload HTML file
- **Editor**: Iframe-based WYSIWYG with inline text editing, image translation, SEO controls, per-language slugs
- **Publishing**: Deploy to Netlify with image optimization (WebP), A/B testing with split routing
- **Images**: Batch image translation — upload images, translate via Kie AI to sv/da/no, export as zip
