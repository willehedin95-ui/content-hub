# Quiz Funnel Builder

Replace Clarflow with an in-house quiz funnel builder. Adapt Clarflow's node/edge data model and static-runtime publish pattern; reuse the existing Page Builder for per-step content editing.

## Context

Hydro13 is the only active Meta-ad product. Clarflow hosts the current Hydro13 quiz but costs $49-299/mo and siloes data from the hub (workspaces, markets, Meta-push, Klaviyo, analytics all live in content-hub). The hub already has: Page Builder with 9 design controls and AI edit, Cloudflare Pages publishing per market, workspace/market-URL infra, Meta Pixel events, Klaviyo integration. Building our own quiz engine on top of this stack is ~8-10 days and eliminates the subscription.

Pre-sell quiz funnels work by moving a prospect from symptom → felt cost → better baseline → pattern → inaction cost → product, using self-generated persuasion. Conversion requires: per-step A/B testing, dropoff visibility, email capture, and fast brand-customized pages.

## Scope

**In v1:**
- Node/edge data model (copied 1:1 from Clarflow's runtime schema)
- Logic canvas (React Flow) with conditional routing per option
- Step content editor reusing existing `src/components/builder/`
- Element kinds: `title`, `text`, `question`, `image`, `custom_html`, `loading`
- Static `quiz-runtime.js` bundle + HTML shell publish to Cloudflare Pages
- Publish to `halsobladet.com/quiz/{slug}`, `smarthelse.dk/quiz/{slug}`, `helseguiden.com/quiz/{slug}` via existing `publishPage`
- Per-step A/B variants (random assignment, sticky via localStorage)
- Event logging to Supabase + Meta Pixel events
- Analytics dashboard: funnel view, dropoff per step, option distribution, variant comparison
- Quiz Swiper: Clarflow fast-path (read `window.__CLARFLOW_DATA__`) + generic Playwright scraper
- Klaviyo email capture at designated step
- Redirect to `market_product_urls` entry with UTM + discount code

**Out of v1 (later):**
- AI quiz generation (write copy with Claude in hub chat)
- Custom domains (use the market blog domains for now)
- Embed snippet
- Visual theme presets beyond the existing workspace brand
- Multi-whole-quiz variants (only per-step for v1)
- Advanced segmentation/scoring engines

## Data Model

### Runtime data (JSONB on `quizzes.data`)

Shape mirrors Clarflow so the Swiper import is lossless:

```ts
type QuizData = {
  id: string;
  nodes: Record<string, Node>;
  edges: Record<string, Edge>;
  camera: { x: number; y: number; z: number };
};

type Node =
  | { id: string; kind: 'start'; size: Size; position: Point }
  | { id: string; kind: 'step'; name: string; size: Size; position: Point; rotation: number; subEls: SubEl[] }
  | { id: string; kind: 'exit'; name: string; size: Size; position: Point; redirectUrl: string };

type Edge = { id: string; from: string; to: string; condition?: RouteCondition };

type RouteCondition =
  | { kind: 'default' }
  | { kind: 'option'; questionElId: string; optionId: string };

type SubEl =
  | { kind: 'title'; text: string; isRichText: true; contentFormat: 'html' }
  | { kind: 'text'; text: string; isRichText: true; contentFormat: 'html' }
  | { kind: 'question'; kindOf: 'single' | 'multi'; layout: 'list' | 'cards' | 'image_cards'; options: QuestionOption[] }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'custom_html'; html: string }
  | { kind: 'loading'; text: string; style: string; seconds: number };

type QuestionOption = { id: string; label: string; emoji?: string; imageUrl?: string; value?: string };
```

Conditional routing is stored on edges via `condition`. A step with branching has multiple outgoing edges; the runtime picks the edge whose `condition.optionId` matches the user's answer, falling back to the `default` edge.

### Supabase tables

```sql
-- One quiz = one funnel
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  market text not null,             -- 'se' | 'dk' | 'no'
  slug text not null,               -- url path segment
  name text not null,
  status text not null default 'draft',  -- 'draft' | 'published' | 'archived'
  data jsonb not null default '{}',      -- QuizData
  settings jsonb not null default '{}',  -- QuizSettings (see below)
  published_url text,                    -- full public URL after publish
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, slug)
);

-- Per-step A/B variants (Clarflow-style: granular, not whole-quiz)
create table quiz_variants (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  step_id text not null,                 -- nodes[step_id]
  name text not null,                    -- 'A', 'B', 'emoji variant', etc.
  subEls jsonb not null,                 -- override SubEl[] for this variant
  traffic_pct int not null default 50,   -- sums to 100 across variants for a step
  created_at timestamptz not null default now()
);

-- One row per session (a single quiz attempt)
create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  exit_clicked boolean not null default false,
  variant_assignments jsonb not null default '{}',  -- { stepId: variantId }
  utm jsonb,                             -- captured from landing URL
  user_agent text,
  market text,
  email text,                            -- captured when user opts in
  answers jsonb not null default '{}'    -- { questionElId: [optionId, ...] }
);

-- Append-only event log for analytics
create table quiz_events (
  id bigserial primary key,
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  step_id text,
  variant_id uuid,
  event_type text not null,              -- 'step_view' | 'answer' | 'email_capture' | 'back' | 'exit_click' | 'abandon'
  option_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index on quiz_events (quiz_id, created_at desc);
create index on quiz_events (session_id);
create index on quiz_sessions (quiz_id, started_at desc);
```

### QuizSettings (JSONB on `quizzes.settings`)

```ts
type QuizSettings = {
  brandLogo?: { url: string; enabled: boolean };
  brandColors: { background: string; textPrimary: string; textSecondary: string; primaryBrand: string; optionBackground: string };
  fontSettings: { enabled: boolean; fontFamily: string };
  progressBar: boolean;
  stepProgressCount: boolean;
  backNavigation: boolean;
  metadata: { title: string; description: string; ogImage?: string; favicon?: string };
  providers: {
    klaviyo?: { listId: string; captureAtStepId?: string };
    metaPixel?: { pixelId: string };
    ga4?: { measurementId: string };
  };
  redirectUrl: string;               // final exit URL, usually from market_product_urls
  customCode?: { head?: string; bodyEnd?: string };
};
```

## System Architecture

Three surfaces:

1. **Editor** — Next.js pages in the hub at `/quizzes/*`
2. **Runtime** — static `quiz-runtime.js` + HTML shell published to Cloudflare Pages
3. **Analytics** — dashboard in the hub reading `quiz_events` + `quiz_sessions`

### Editor (`src/app/quizzes/`)

Routes:
- `/quizzes` — list quizzes for active workspace (grid, new button, duplicate/delete)
- `/quizzes/new` — choose starting point: blank, template, or swipe
- `/quizzes/[id]/edit` — main editor (logic canvas + step editor)
- `/quizzes/[id]/settings` — branding, metadata, providers, redirect
- `/quizzes/[id]/preview` — rendered preview iframe
- `/quizzes/[id]/analytics` — dashboard
- `/quizzes/swipe` — paste URL, start import

Editor layout at `/quizzes/[id]/edit` (full-screen overlay like Page Builder):

```
┌─ Top bar: name | Editor | Preview | Settings | [Analytics] | Saved | Update ─┐
├─ Left sidebar ──── Canvas ─────────────────────── Step editor ───────────────┤
│ Steps tree       (React Flow logic canvas)      (Page Builder iframe)       │
│  1. Age          • START ──▶ step1 ──▶ step2     rendering the currently     │
│  2. Routine      •   branching shown as edges    selected step's subEls      │
│  ...             • select node = opens editor    as if it were a page        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key components:**

- `src/components/quiz-builder/QuizShell.tsx` — top-level layout, owns `QuizContext`
- `src/components/quiz-builder/QuizContext.tsx` — mirrors the `BuilderContext` pattern; holds `quizData`, selection, undo/redo, autosave
- `src/components/quiz-builder/LogicCanvas.tsx` — React Flow canvas; custom node renderers per kind; drag-to-connect builds edges; per-option branch handles on question nodes
- `src/components/quiz-builder/StepsTree.tsx` — left sidebar, ordered by topo-sort of edges; shows conditional-routing toggle per step
- `src/components/quiz-builder/StepEditor.tsx` — renders the selected step's `subEls` as a fake page and mounts the existing Page Builder around it; saves back to `quizData.nodes[stepId].subEls` on edit
- `src/components/quiz-builder/VariantSwitcher.tsx` — in-step control to pick/create A/B variant; mutates `quiz_variants` via API
- `src/components/quiz-builder/ElementPalette.tsx` — drag-in: Title, Text, Question, Image, Custom HTML, Loading

**Reusing Page Builder:**

The Page Builder is a general HTML editor — we wrap a `<div data-quiz-step="{stepId}">` around the rendered subEls and point the builder at it. All 9 design controls, AI edit, rich text, image replace, and countdown timers work unchanged. On save, we parse the resulting HTML back into `SubEl[]`: titles/texts extract inline, questions come from a `data-quiz-question` wrapper with `data-quiz-options` JSON, images from `<img>` tags, custom_html for anything that doesn't match. This is symmetric with how the builder already handles countdown elements via `data-countdown-*` attributes.

### Runtime (`runtime/quiz-runtime/`)

A new workspace package built as a single minified bundle, uploaded once to each Cloudflare Pages project as `/_runtime/quiz-runtime.[hash].js`. Same bundle serves every quiz on that domain. Published quizzes are static HTML:

```html
<!doctype html>
<html>
  <head>
    <title>{metadata.title}</title>
    <meta property="og:image" content="{metadata.ogImage}">
    <link rel="stylesheet" href="/_runtime/quiz-runtime.{hash}.css">
    {customCode.head}
  </head>
  <body>
    <div id="quiz-root"></div>
    <script>window.__QUIZ_DATA__ = { ...serialized QuizData... };
            window.__QUIZ_SETTINGS__ = { ... };
            window.__QUIZ_VARIANTS__ = { stepId: [{id, subEls, traffic_pct}, ...] };
            window.__QUIZ_CONFIG__ = { apiBaseUrl, quizId };</script>
    <script src="/_runtime/quiz-runtime.{hash}.js" defer></script>
    {customCode.bodyEnd}
  </body>
</html>
```

**Runtime responsibilities:**

- On load: assign a variant per step with A/B variants (weighted random, persist to localStorage keyed by `quiz_{id}_variant_{stepId}`); POST `quiz_session_start` → `/api/quiz/session` to get a `session_id`
- Render current node (start → first step); handle step navigation via edge lookup
- For each answer: fire `answer` event; compute next node using answer → edge condition; animate transition
- Progress bar/back nav based on settings; back uses history stack
- On designated email-capture step: post to Klaviyo subscribe API (proxied through `/api/quiz/klaviyo-subscribe` to hide keys)
- Fire Meta Pixel events: `PageView` on load, `Lead` on email capture, `CompleteRegistration` on exit click
- On exit: log `exit_click` with redirect URL, then navigate (with UTM from settings + session/variant params)

**State machine:** purely client-side, no React needed (keep bundle small). Consider Preact or vanilla TS with a small template renderer. Target bundle size: < 30KB gzipped.

**Event batching:** events buffered and flushed every 2s or on page-hide to `/api/quiz/events` (batch endpoint).

### Publishing

Extend `src/lib/cloudflare-pages.ts`:

- `publishQuiz(quizId)`:
  1. Load `quizzes` row + active `quiz_variants` for each step
  2. Generate HTML shell (above) with inlined JSON
  3. Determine CF Pages project from market: se → halsobladet-blog, dk → smarthelse, no → helseguiden
  4. Ensure runtime bundle is present at `/_runtime/quiz-runtime.{hash}.{js,css}` (upload if missing or new version)
  5. Upload `quiz/{slug}/index.html` via existing Direct Upload API
  6. Update `quizzes.published_url` and `published_at`
- `publishQuizABTest(quizId)`: same, but variants are baked into `__QUIZ_VARIANTS__` blob — no separate deploys; runtime picks variant
- Runtime bundle is built by a Vite config in `runtime/quiz-runtime/`, versioned by content hash

Cache headers: `/_runtime/*` gets `immutable, max-age=31536000`; `quiz/{slug}/index.html` gets `no-cache` so edits go live instantly.

## Quiz Swiper

**Entry point:** `/quizzes/swipe`. Paste URL, click Start.

**Server route:** `POST /api/quiz/swipe` → spawns a Playwright job (use existing Playwright setup in content-hub dev dependencies).

**Flow:**

1. Playwright opens the URL, waits for DOM content loaded.
2. **Clarflow fast-path**: check `window.__CLARFLOW_DATA__`. If present, deep-clone, remap IDs to new `step_{random}` format, save as a new `quizzes` row. Done in ~5s.
3. **Generic fallback**: detected by absence of Clarflow globals.
   - Snapshot visible step: text content, headings, option buttons (text + image if any), page HTML.
   - Identify "continue" or first option, click it.
   - Repeat until the page URL changes (exit) or no progress element advances.
   - Build `SubEl[]` heuristically per step: first large text → `title`, body text → `text`, button group → `question` with options, `<img>` → `image`, everything else → `custom_html`.
   - Store screenshots as `image` subEls on steps where layout is complex (user can clean up after).
4. On completion: show "Imported N steps" with a link to the editor for review.

**Known limitations to surface to the user in v1:**
- Branching logic from generic quizzes isn't inferrable from a single playthrough; imports are linear by default.
- Image assets are fetched and re-uploaded to our CDN; some CORS'd images may fail (log warning, leave placeholder).

## A/B Testing

**Model:** per-step variants. A `quiz_variants` row overrides the `subEls` array of a specific step. `traffic_pct` distributes sessions.

**Assignment:**
- At step view, runtime checks `localStorage['quiz_{id}_variant_{stepId}']`. If absent, pick weighted random and persist.
- `variant_assignments` on the session record is authoritative for analytics (written on session start + on each new variant assignment).
- Variants are stable within a session but independent across steps (seeing variant A on step 2 does not correlate with variant on step 5).

**Editor UX:**
- A step node with variants shows a small badge on the canvas.
- Opening a step reveals a variant selector at the top of StepEditor. Clicking "+ Variant" clones the current subEls.
- Traffic split slider per step (default 50/50).
- "End test" button: picks the winner, copies its subEls to the base step, deletes variant rows.

**Analytics:** compare conversion (defined as reaching `exit_click`) and per-step dropoff between variants for the same step.

## Analytics Dashboard

Route: `/quizzes/[id]/analytics`.

**Computed views (all use `quiz_events` + `quiz_sessions`):**

1. **Funnel view** — horizontal bar per step in topological order; width proportional to `sessions reaching step / sessions started`. Red delta between adjacent bars highlights dropoff.
2. **Option distribution** — per question, stacked bar showing % selecting each option.
3. **Variant comparison** — where variants exist, show pairs (A vs B) side-by-side with conversion, step-through rate, and option distribution.
4. **Completion funnel** — started → email captured → exit clicked, as three big numbers with percentages.
5. **Time per step** — median and p90 seconds between step_view and next step_view.
6. **Meta attribution** — sessions grouped by utm_source/utm_campaign (from the `utm` JSONB captured on session start), with conversion rate per.

**SQL shape (hot query):**

```sql
-- Sessions per step
select step_id, count(distinct session_id) as sessions
from quiz_events
where quiz_id = $1 and event_type = 'step_view' and created_at > $2
group by step_id;
```

Use Supabase RPC functions for the heavy aggregates; cache dashboard response for 60s client-side.

**Meta Pixel wiring:** runtime fires `fbq('track', 'Lead', {content_name: quiz.name})` on email capture and `fbq('track', 'CompleteRegistration', {content_name: quiz.name})` on exit click. Pixel ID comes from `settings.providers.metaPixel.pixelId`. Values set to 0 (not a purchase signal).

## API Routes

All under `src/app/api/quiz/`:

- `POST /api/quiz` — create quiz (body: `{ workspace_id, market, name, starting_point: 'blank'|'template'|'swipe_url', swipe_url? }`)
- `GET /api/quiz/[id]` — load quiz + variants (editor)
- `PATCH /api/quiz/[id]` — autosave quiz data/settings (debounced client-side)
- `POST /api/quiz/[id]/publish` — build shell, upload to CF, update `published_url`
- `POST /api/quiz/[id]/duplicate` — clone
- `DELETE /api/quiz/[id]` — soft delete (status → archived)
- `POST /api/quiz/[id]/variants` — create variant
- `PATCH /api/quiz/variants/[variantId]` — update variant
- `DELETE /api/quiz/variants/[variantId]`
- `POST /api/quiz/swipe` — kick off Playwright import; returns new quiz id

**Runtime endpoints (called from published quiz, must be CORS-friendly):**

- `POST /api/quiz/session` — start session; body: `{ quizId, variant_assignments, utm, ua, market }`; returns `{ session_id }`
- `POST /api/quiz/events` — batch; body: `{ session_id, events: [{ event_type, step_id, variant_id, option_id, meta }] }`
- `POST /api/quiz/klaviyo-subscribe` — proxy to Klaviyo with workspace's credentials; body: `{ session_id, email, listId }`

## Implementation Phases

Order matters; each phase should be demo-able.

**Phase 1 — Scaffolding + data model (1 day)**
- Supabase migrations for 4 tables
- TypeScript types in `src/types/quiz.ts`
- Empty routes + list page at `/quizzes`
- `createQuiz` API returns a hardcoded "Hello Quiz" draft

**Phase 2 — Editor MVP (2 days)**
- `QuizContext` + autosave
- Logic canvas with React Flow, custom start/step/exit node renderers
- Steps tree + add/delete/reorder nodes
- Per-option branching with edge conditions
- Basic StepEditor using existing Page Builder wrapped around a fake page
- Element palette (drag-in title/text/question/image)

**Phase 3 — Runtime + publish (2 days)**
- Vite project in `runtime/quiz-runtime/`; Preact-based renderer; local dev via `/public/quiz-preview/{slug}`
- HTML shell generator in `src/lib/quiz-publish.ts`
- Extend `cloudflare-pages.ts` with `publishQuiz`
- Session + events APIs; runtime fires events
- Test publish to halsobladet.com/quiz/test-hydro13

**Phase 4 — A/B variants (1 day)**
- `quiz_variants` CRUD + editor UI
- Runtime variant assignment + persistence
- Bake variants into `__QUIZ_VARIANTS__` on publish

**Phase 5 — Analytics dashboard (2 days)**
- Supabase RPC functions for aggregates
- Funnel view, option distribution, variant comparison components
- Meta Pixel integration in runtime
- Klaviyo capture proxy

**Phase 6 — Quiz Swiper (2 days)**
- Clarflow fast-path (`window.__CLARFLOW_DATA__` extraction + ID remap)
- Generic Playwright scraper (linear import with heuristic element mapping)
- Image re-hosting to Supabase storage
- Swipe UI page

**Phase 7 — Hydro13 migration + launch (0.5 day)**
- Import existing Clarflow Hydro13 v2 quiz via Swiper
- Touch-up pass in editor
- Publish to halsobladet.com/quiz/hydro13-beauty (SE), with DK/NO versions duplicated
- Wire Meta Pixel + Klaviyo
- Flip ads to new URL, monitor

**Total: 10 engineer-days.**

## Open Questions

- **Preact vs vanilla runtime**: Preact adds ~3KB gz but simplifies DOM diffing as variants/steps swap. Recommend Preact. Decide during phase 3.
- **Should variants affect edges too?** For v1, variants override `subEls` only. If we later want a variant to route to a different next step, extend variant schema to include edge overrides.
- **Image hosting during import**: re-upload scraped images to Supabase storage (`quiz-assets/...`) vs. hotlink original. Re-upload is safer (no broken quizzes if source deletes) but adds transfer cost. Recommend re-upload.
- **Rate limiting on runtime endpoints**: `/api/quiz/events` is public and will be hit on every step. Use Supabase connection pooling + per-IP rate limit (e.g., 60 req/min) via an edge middleware.
- **GDPR / cookie banner**: halsobladet.com doesn't have one today. Events use a session UUID, no third-party cookies. Meta Pixel is the only concern — needs consent banner if we add it. Decide before DK/NO launch.
