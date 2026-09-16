# Claude Code Instructions

## After completing changes

Always commit changes after finishing a task. **Do not push without asking** - the push
auto-deploys to Vercel (see Hard constraints below; the two rules used to contradict each
other and a session pushed four commits to production on the strength of this line).

**When pushing to Vercel**: Always tell the user the git short hash of the pushed commit (e.g. `508b6dd`) so they can verify the deploy is live by checking the version shown in the sidebar footer.

**The PAT baked into `origin` is dead** (revoked some time before 2026-09-01; `git push`
returns "Invalid username or token"). Do not paste a working token back into `.git/config`.
Push with the vault copy instead, which never touches disk:

```
export OP_SERVICE_ACCOUNT_TOKEN=$(cat ~/.config/op/claude-sa-token)
T=$(op item get "github token claude" --vault Dropship --format json | python3 -c "import json,sys; print(next(f['value'] for f in json.load(sys.stdin)['fields'] if f.get('id')in('credential','password') and f.get('value')))")
git push "https://willehedin95-ui:${T}@github.com/willehedin95-ui/content-hub.git" main
```

`op read "op://Dropship/github token claude/credential"` does **not** work for this item -
it has no field named `credential`, so read the fields as above.

**A green Vercel deploy does not mean the change is live.** `content-hub-nine-theta.vercel.app`
sat on a February deploy for months because `autoAssignCustomDomains` was off, so the domain
never followed new production deploys. Fixed 2026-09-01, but always confirm the build id
actually changed before reporting a commit as live. `VERCEL_TOKEN` is in `.env.local` (the
one in 1Password is for the EPS project and has no access here).

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
- Standalone scripts (`scripts/*.ts`) load env via `process.loadEnvFile?.(".env.local")` at the top (Node 20+). NEVER `source .env.local` in a shell — values with special characters break parsing mid-file and downstream API calls (e.g. Cloudflare) get empty vars and fail with confusing errors.
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

Tables: `pages`, `translations`, `ab_tests`, `usage_logs`, `image_jobs`, `source_images`, `image_translations`, `versions`, `ad_copy_jobs`, `ad_copy_translations`, `meta_campaigns`, `meta_ads`, `meta_campaign_mappings`, `meta_page_configs`, `market_product_urls`, `cf_pages_manifests`, `products`, `product_images`, `copywriting_guidelines`, `reference_pages`, `forms`, `form_submissions`

## Hosting & domains

- **App hosting**: Vercel (auto-deploys on push to `main`)
- **Landing page hosting**: Cloudflare Pages (direct upload API, free unlimited deploys)
  - `halsobladet-blog` → halsobladet.com (Swedish, HappySleep only since 2026-04-21)
  - `smarthelse` → smarthelse.dk (Danish)
  - `helseguiden` → helseguiden.com (Norwegian)
- **Hydro13 blog**: publishes to `get-renew.com/blogs/kollagen/*` via Shopify Admin API (NOT CF Pages). Routed by `workspaces.settings.blog_publish_target: "shopify"`. See `src/lib/shopify-blog-publish.ts`.
- **DNS**: Cloudflare manages DNS for smarthelse.dk and helseguiden.com; Hostinger manages halsobladet.com (subdomain CNAME)
- **Domain registrar**: Hostinger (all three domains)
- **Publishing code**: `src/lib/cloudflare-pages.ts` — `publishPage()`. (A/B-testning via `ab_tests`/`publishABTest` är BORTTAGEN 2026-07-07 — nya systemet är `page_tests`, två separata pages med Meta-adset-split. CF-projekt→workspace-mappning: `workspaces.settings.cf_pages_projects` med konstant-fallback i cloudflare-pages.ts — nya CF-projekt MÅSTE mappas där, annars kastar sitemap-deployen.)
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
- **Forms** (`/forms`): Self-hosted support forms replacing Fillout (phase 1: Envana). Config-driven forms in `forms` table rendered by `public/forms-embed/v1.js` on Shopify pages; persist-first submissions in `form_submissions` with retry delivery to per-workspace helpdesk (`workspaces.settings.forms_helpdesk`, Freshdesk adapter + email fallback in `src/lib/form-delivery.ts`). Public routes: `/api/forms/{config,submit,upload}`, `/f/[workspace]/[slug]` (add `?test=1` for no-ticket test mode). Internal metadata goes to a PRIVATE Freshdesk note - never in the ticket description (agents quote it in replies). Full docs in auto memory `content-hub-forms.md`. **Field kinds now include `hidden`** (value from the host page's query string via `fromParam` + `fallback`), and **`fromParam` lives on FormFieldBase** so any field can be prefilled from the link - one form can carry several variants instead of a copy per variant (progressbild uses `?steg=1|2|3` and `?e=`). **Two fields must never share a `key`**: the embed's conditional update uses `querySelector('[data-key=...]')`, which only finds the first, so the second is never hidden and both render. **Stop the dev server before `npm run build`** - the build overwrites `.next` and the running dev server starts returning 500. **Always add `?test=1`** when testing a form; without it a real helpdesk ticket is created.
- **Forms — app-läge, token och Klaviyo** (progressbildsflödet, 2026-09-15): `config.theme.mode === "app"` renderar ett formulär som fullskärms onboarding i stället för ett kort på grå botten (mätt ur `runtime/quiz-runtime` och `app-venture/snowball` — kontakt/ångerrätt lämnas utan tema och är oförändrade). `config.delivery` styr vart en inskickning tar vägen: utan fältet helpdesk, `"none"` sparar bara, `{ type: "klaviyo", brand, metric, seriesField }` postar ett event. **En progressbild är ingen supportfråga** — med helpdesk fick kunden ett "vi återkommer inom 24 timmar" som ingen tänker svara på. Kundlänkar signeras med HMAC i `src/lib/forms-token.ts` (`FORMS_TOKEN_SECRET`); `/api/forms/series` slår upp kundens bildserie på den token och **aldrig på en inskriven e-post** — bucketen är publik, så ett e-postuppslag hade lämnat ut andras ansiktsbilder. Uppladdade bilder normaliseras med sharp till JPEG i 4:5 (löser HEIC från iPhone som Gmail inte visar, och blandad orientering som förstör serien). Mailmallarna byggs av `emails/progressbild/build.py` och laddas upp med `scripts/upload-klaviyo-templates.ts`.
- **CORS på forms-endpoints kräver `Vary: Origin`** — de är cachebara (`s-maxage=60`), så utan den cachar CDN:en CORS-headern och det FÖRSTA svaret bestämmer för alla. Uppmätt i produktion 2026-09-15: ett av tio anrop från shopenvana.com fick `allow-origin: null` och blockerades av webbläsaren, alltså laddade formuläret inte alls för den kunden. Rör aldrig `s-maxage` i `api/forms/config` utan att kontrollera att Origin står kvar i Vary.
- **Forms-runtimen: `choice`, `asCta` och tomma steg.** `kind: "choice"` renderar val som KNAPPAR som sätter fältets värde och går vidare själva; ett steg med `choice` ritar INGEN egen CTA (knapparna är stegets handling). `asCta` på ett filfält gör stegets CTA till den som öppnar filväljaren, så skärmen har en knapp i stället för tre. **`nextVisibleStep` returnerar `null`** när inget steg framåt har innehåll, och då skickar knappen in direkt - föll den tillbaka på `from` landade kunden på ett TOMT steg, vilket hände i produktion när dag 60-svansen (bortvillkorad vid dag 1 och 30) lades till. Mobilsvepet fångar det inte: det mäter scroll och tryckytor, inte om en skärm är tom.
- **`conditionMet` finns i TVÅ kopior** - `public/forms-embed/v1.js` och `src/lib/form-utils.ts`. De måste hållas i synk. `isEmpty` lades till i klienten och i typerna men aldrig i spegeln, och servern nekade därför hela dag 30 och dag 60 med "Obligatoriska fält saknas: email". Ändrar du villkorstolken, ändra båda.
- **`FORMS_TOKEN_SECRET` måste finnas i Vercel**, inte bara i `.env.local`. Saknas den misslyckas den signerade kundlänken TYST i båda ändar: uppslaget svarar "vi vet inte vem du är" och leveranslagret fångar undantaget och skickar eventet utan token. Ingenting larmar.
- **Två gates före en forms-deploy**: `npx tsx scripts/regress-forms.ts` laddar alla tolv publicerade formulär (workspace MÅSTE anges — DK-formulären ligger under happysleep, inte hydro13), och `npx tsx scripts/mobile-sweep.ts` mäter sidledsscroll, tryckytor och textstorlek på 375 och 390 px. **En screenshot avslöjar aldrig sidledsscroll** — mailmallarna spillde över med 234 px medan de såg korrekta ut i bild.
- **Envana Shopify** (`n5ftzr-mq.myshopify.com`): åtkomst via client_credentials mot `/admin/oauth/access_token`, samma flöde som `src/lib/shopify.ts` redan använder. Valvet (`Envana Shopify App` i Dropship) har app-id och secret (`shpss_`), INTE ett färdigt `shpat_`. Sidan `/pages/resa` kör en egen layout utan butikens header/footer — se `shopify/envana/README.md`. Shopify **sanerar bort `<script>` ur en sidas `body_html`; embedden måste ligga i templaten.**
- **Settings**: Configurable quality threshold, default languages, economy mode, notification email, Kie AI credit balance, Meta Ads connection test
- **Before/After** (`/assets`): generates before/after testimonial images. `ASPECT_RATIO` matters more than it looks - at 16:9 each half lands near square, which the wide zone crops (forehead, eye area, neck) need; squarer output makes each half a narrow strip and the model zooms out to a portrait or tiles the pair into a 2x2 grid. The prompt is told the ratio so 1:1 works too, but 16:9 plus a crop in Post Production is the reliable route. Four intensity families keyed on zone: skin, nails, hair, and body (neck/chest/arm/leg/hands) - the skin ladder is written around undereye and nose redness and does nothing for a zone with no face in frame. Gender defaults hard to woman. Post-production (`src/lib/post-production.ts`) is Canvas API and cannot run in Node; `scripts/envana-postprod.ts` bundles the unchanged module with esbuild and runs it in headless Chrome rather than reimplementing the filter.
- **Brand Check** (`/brand-check` authed; `/bcheck` public token-gated mobile, hidden — no sidebar link): brand-name screening tool. Per name: .com domain availability (15 prefix/suffix variants via RDAP), real web search via **Serper.dev** (`SERPER_API_KEY`), AI name generator (Claude, `src/lib/brand-ideas.ts`), and a pre-filtered TMview link (class 3/5/35 + offices + live marks). Saved shortlist in `brand_shortlist` table; 7-day cache in `brand_check_cache`. Code: `src/lib/brand-check.ts`, `src/app/brand-check/`, `src/app/bcheck/`, `src/app/api/{brand-check,bcheck,brand-shortlist,bcheck-shortlist,brand-ideas,bcheck-ideas}`. **KEY LESSON: server-side scraping of TMview/DuckDuckGo does NOT work from Vercel's datacenter IP (timeouts/blocks) though it works locally — TM is a browser deep-link, web search uses Serper API. Always test prod-reliant features against prod, not local.** Public routes whitelisted in `src/middleware.ts`. `BRAND_CHECK_TOKEN` env gates `/bcheck` (not set yet).

- **Pickup tracker** (`/api/cron/pickup-tracker`, varje timme): recensionsmejl som triggar pa att kunden HAMTAT UT paketet hos ombudet, inte pa en tidsfordrojning. Kedjan: Shelfless DISPATCHED-leveranser -> Brings tracking-API -> `Package Picked Up` till ratt Klaviyo-konto nar status blir `DELIVERED`. Kod: `src/lib/bring.ts`, `src/lib/klaviyo-events.ts`, `fetchDispatchedDeliveries`/`hasCollagenRow` i `src/lib/shelfless.ts`, state i `parcel_tracking`. Env: `BRING_API_UID`, `BRING_API_KEY` (mybring; nyckeln ar utfardad pa shopenvana-kontot men ar INTE kontobunden - laser paket fran alla butiker), `KLAVIYO_SB_API_KEY`, `KLAVIYO_ENVANA_API_KEY`.
  - **Bring rapporterar INGENTING till Shopify.** Matt: 711/711 kollagen-fulfillments har `shipment_status = null` och noll fulfillment-events. Shelfless slutar pa DISPATCHED och deras `deliveryDate` ar identisk med `shippedDate` pa sekunden. Klaviyos `Delivered Shipment` finns men alla 699 events sedan arsskiftet ar YunExpress (kuddarna), noll Bring. Uthamtning gar ENDAST att fa fran Brings eget API.
  - **En fast fordrojning duger inte som ersattning**: efter 5 dygn har 65% hamtat ut, efter 7 dygn 81%, tak 89% (11% hamtar aldrig).
  - **`MAX_EVENT_AGE_HOURS` (36h) ar en sparr mot massutskick**: nar bevakningen startar upptacks hela backloggen (292 paket vid uppsattningen). Utan den hade alla fatt mejl samtidigt. Ror den inte utan att tanka igenom vad som hander vid en omstart.
  - **`?manual=true&dry=true`** gor allt utom att skicka till Klaviyo. Anvand alltid det forst.

## Hard constraints (NEVER do these)

- **NEVER push to main without user confirmation** — The project auto-deploys to Vercel. An accidental push deploys broken code instantly.
- **NEVER run `git add -A` or `git add .`** — Stage specific files only. This project has `.env` files, credentials, and large binaries that must never be committed.
- **NEVER run multiple dev servers** — Always check `lsof -i :3000` before starting. Multiple servers cause system-wide slowdowns.
- **NEVER guess API endpoints or parameters** — Read the actual code in `src/lib/` before making API calls. Meta, Supabase, Cloudflare, and Kie all have non-obvious behaviors.
- **NEVER use the Supabase service role key for DDL** — It only supports PostgREST (data operations). Schema changes MUST go through the Management API.
- **NEVER set `is_dynamic_creative` on an existing Meta ad set** — It can only be set at creation time. Meta silently ignores the update.
- **NEVER retry Meta creation calls on timeout/5xx** — outcome is unknown; a retry can create duplicate ACTIVE ads. Use `metaJsonMutating` (429-only retry) for creates; transient retry is for idempotent calls only.
- **NEVER call money-writing Meta functions outside `runWithMetaConfig`** — the module-global `setMetaConfig` can be swapped by concurrent requests and land ads/pauses in the wrong ad account.
- **NEVER skip `npm run build`** — Always verify the build passes before committing. TypeScript errors caught here prevent broken deploys.
- **NEVER create files at the project root unless they're config files** — Components go in `src/components/`, utilities in `src/lib/`, types in `src/types/`.
- **NEVER hardcode API tokens in source files** — All tokens live in `.env.local`. Reference via `process.env.VARIABLE_NAME`.
- **NEVER modify the Supabase service role key or project URL** — These are shared infrastructure. If they look wrong, ask before changing.

## Session continuity

At the start of a session, check `.claude/journal/LATEST.md` and `.claude/tasks/backlog.md` for context from previous sessions. This prevents wasting time re-establishing what was already done.

At the end of a session, run `/wrap-up` to commit code, journal what happened, file business context to the Obsidian vault, and update memory. The skill is global (`~/.claude/skills/wrap-up/`) and works in every project - it detects the build command and deploy posture from this file, so keep the build/push rules above accurate.

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
