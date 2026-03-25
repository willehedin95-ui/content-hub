# Session: 2026-03-25 late evening (session 6)

## What was done
- **Research Intelligence System — full implementation:**
  - 4 database tables: `research_sources`, `research_nuggets`, `research_themes`, `research_nugget_themes`
  - Trustpilot scraper (`src/lib/trustpilot.ts`) — no API key, parses `__NEXT_DATA__` JSON from HTML. Fixed 308 redirect bug (page=1 strips query params, losing `languages=all` filter)
  - AI evaluation pipeline (`src/lib/research-evaluate.ts`) — Claude Haiku extracts sentiment, significance (1-10), customer phrases, pain points, desires, tags
  - Daily scanner cron (`/api/cron/research-scan`, 10:00 UTC) — loops research-enabled workspaces, scrapes all active sources, evaluates with Haiku, upserts nuggets
  - Weekly theme detection cron (`/api/cron/research-themes`, Sunday 11:00 UTC) — Claude Sonnet synthesizes patterns from recent nuggets, creates/updates themes, sends Telegram weekly digest
  - Research context injection (`src/lib/research-context.ts`) — `buildResearchContext()` feeds real customer language into brainstorm/autopilot/swipe prompts (same pattern as learnings/hooks)
  - Wired into: `brainstorm.ts` (all 7 mode builders), `brainstorm/route.ts`, `autopilot-concepts/route.ts`, `swipe-competitor.ts`
  - 4 API routes: sources (CRUD), nuggets (paginated with filters), themes, stats
  - UI: `/research` page with Feed/Themes/Sources tabs, added to sidebar with BookOpen icon
  - Seed data import script (`scripts/import-research-seed.ts`) — parses CORE INSIGHTS and RAW MARKET COMMENTS files
  - Pre-configured 7 Trustpilot sources for Hydro13 workspace (Oslo Skin Lab SE/NO/DK, SwedishBalance, Copenhagen Health, Collaxan, Elexir Pharma)
  - Enabled `research_enabled: true` on Hydro13 workspace

## Key decisions
- Scraping approach (not API) — Trustpilot API keys are hard to get; `__NEXT_DATA__` works perfectly
- Significance threshold: only store nuggets >= 4/10, show gold >= 8/10
- Nordic languages = "primary" (direct copy ammunition), English = "reference" (trend scouting)
- Full automation — no human review step
- Per-workspace — currently Hydro13 only

## Commits
- `6d9e2f4` — Research Intelligence System (21 files, +2,617 lines)

## What's next
- Run seed data import to backfill existing VOC research
- Monitor first automated scan (tomorrow 10:00 UTC)
- Send additional Trustpilot brands to add as sources
- Wire research into blog-writer.ts (planned but not done yet)
