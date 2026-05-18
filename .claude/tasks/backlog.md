# Content Hub - Task Backlog
Updated: 2026-05-18 21:28 (SEO pipeline session complete; HappySleep blog parked; William as Hydro13 author live)

## SEO Pipeline Session - completed 2026-05-18

Massive 2-day session finalizing SEO pipeline. All commits on origin/main.

### Done (committed + pushed)
- [x] ~~hreflang fix (verified translation lookup, not assumed same-slug)~~ - commit `46786e8`
- [x] ~~MedicalWebPage schema for YMYL articles~~ - commit `46786e8`
- [x] ~~Fresh badge for recent updates~~ - commit `46786e8`
- [x] ~~Topical cluster cross-linking (related-articles scored by category/keyword/title)~~ - commit `46786e8`
- [x] ~~PAA + Featured snippet in blog-writer prompt~~ - commit `46786e8`
- [x] ~~GSC index-check cron (Mon 06:45 UTC) + indexation dashboard card~~ - commit `46786e8`, `deaffde`
- [x] ~~Bing Webmaster Tools sitemap submission~~ - commit `46786e8` (NEEDS env var to activate)
- [x] ~~Trustpilot Product+aggregateRating schema (24h cache)~~ - commit `deaffde` (NEEDS workspace setting to activate)
- [x] ~~AVIF generation + <picture>-tag wrapping~~ - commit `deaffde`
- [x] ~~5 new soft-gate checks (featured_snippet, PAA H2s, alt-text, table-wrap, FAQ count)~~ - commit `deaffde`
- [x] ~~Doginwork wrong-target republish (varfor-biter-min-valp moved halsobladet → doginwork.se)~~ - commit `b9deb2a`
- [x] ~~Pillar template + 4 seeded pillar articles~~ - commit `b9deb2a`
- [x] ~~DA + NO glossary (16 articles)~~ - commit `b9deb2a`
- [x] ~~Internal-link depth audit cron (Mon 07:00 UTC)~~ - commit `b9deb2a`
- [x] ~~Preconnect hints in blog shell <head>~~ - commit `b9deb2a`
- [x] ~~Soft-gate allowed-domains: swedishbalance.dk added~~ - commit `97f40bd`
- [x] ~~Soft-gate template-aware thresholds (glossary=800w/3H2, default=2500w/4H2)~~ - commit `2676ea0`
- [x] ~~scripts/republish-via-correct-target.ts (generic wrong-target recovery)~~ - commit `b9deb2a`
- [x] ~~scripts/trigger-blog-autopilot.ts (manual cron trigger)~~ - commit `2676ea0`
- [x] ~~William as Hydro13 author (avatar uploaded + bio + workspace setting activated)~~ - DB update
- [x] ~~vad-ar-biotin published (first article with new William author)~~ - get-renew.com/blogs/kollagen/vad-ar-biotin
- [x] ~~HappySleep blog autopilot disabled~~ - DB update
- [x] ~~64 HappySleep content_plan rows deferred~~ - DB update
- [x] ~~Strategic pivot: HappySleep blog dropped, consolidate on get-renew.com for Hydro13~~

### Needs William action to activate
- [ ] **HIGH: Add `trustpilot_domain` to Hydro13 workspace settings** - either `swedishbalance.se` or `get-renew.com`. Activates Product+aggregateRating schema → star snippets in SERPs.
- [ ] **MEDIUM: Add `BING_WEBMASTER_API_KEY` env var on Vercel** - activates Bing/DuckDuckGo/ChatGPT-search sitemap submission. Get key from Bing Webmaster Tools → Settings → API Access.
- [ ] **MEDIUM: Add `blog_low_rank_updates_enabled: true` to Hydro13 workspace** - activates Fri 13:00 UTC LOW_RANK refresh cron.
- [ ] **LOW: Rotate local ANTHROPIC_API_KEY** in .env.local - currently returns 401 on local scripts. Vercel key works fine, so this only affects local script runs.

### Future single-sweep (4-6 weeks out)
- [ ] **MEDIUM: Bulk-republish all 27 existing Hydro13 articles** - swaps Erik Lindberg → William as author, adds MedicalWebPage schema, hreflang fix, AVIF images, etc. Single sweep is cleaner Google signal than incremental updates.


## Hydro13 Publishing (2026-05-18, IN FLIGHT)

iOS 1.1.0 ready to ship + Android awaiting Google Org verification under Incensor AB. Full session journal: `.claude/journal/2026-05-18-13-44.md`. Full publishing playbook: `~/Obsidian/Vault/memory/app-publishing.md`.

- [ ] **HIGH: Submit Hydro13 iOS 1.1.0 to App Store** - build 24 ready on TestFlight. User must log into App Store Connect, pick build 24 under 1.1.0, write What's New (Swedish), submit for review. 1-3 day Apple review. Claude can write copy + generate fresh simulator screenshots on request.
- [ ] **HIGH: Generate Android Play Store assets while Google verifies** - emulator screenshots (6-8, 1080x2400), feature graphic (1024x500), short description (80 chars), full description (4000 chars), data safety form prep (TelemetryDeck collects anonymous analytics). All in Swedish.
- [ ] **HIGH: Android release signing setup** - generate keystore at `~/keys/renew-android-upload.jks`, add gitignored `app/keystore.properties`, update `app/build.gradle.kts` with release signingConfig, verify `./gradlew bundleRelease` produces signed AAB.
- [ ] **MEDIUM: Push Hydro13-Android local commits to remote** - 18 commits on `main`, origin at `5420100`. Decide repo host (GitHub private?) and push.
- [ ] **MEDIUM: Update App Store screenshots for 1.1.0** - 4-tab to 3-tab UI change, new onboarding, new challenge system, Renew bottle. Current 1.0.0 screenshots are outdated and risk Apple rejection.
- [ ] **LOW: Reply to Apple Support case 20000112399994** - tell Alex to defer migration. Or let it auto-close.
- [ ] **BLOCKED: Publish Hydro13 Android to Play Store** - waiting on Google to verify driver's license + website ownership + phone (Incensor AB org). ETA ~2-3 weeks.
- [ ] **PARKED: Apple Individual -> Organization migration** - deferred indefinitely. Trigger to revisit: product #2 under Renew, investor onboard, or business scale.

## Affiliate Network Setup (2026-05-18, PARKERAT - William saknar tid)

Multi-network affiliate-system (Awin + Adtraction) byggt och pushat. Cron och DB ready. Behöver bara:

- [ ] **HIGH: Sätt Vercel env vars** för affiliate-sync-cron att fungera:
  - `AWIN_API_TOKEN` (hämta från https://ui.awin.com/awin-api -> generate token)
  - `AWIN_PUBLISHER_ID=1949105`
  - `ADTRACTION_API_TOKEN` (från Adtraction-account -> API-tab)
  Cron kör tyst varje måndag 04:00 UTC tills env vars finns.
- [ ] **HIGH: Ansök till relevanta Adtraction-program** (där pengarna är, 3-8x bättre commission än Apotek Hjärtat på Awin):
  - Apotea (största online-apotek SE)
  - Apoteket (statligt apotek)
  - Great Earth (15% per sale, supplement)
  - Svenskt Kosttillskott (12%, EPC 0.29 EUR)
  - Tyngre.se (10%, EPC 0.70 EUR)
  - Greatlife.se (13%, EPC 0.65 EUR)
  - Comforth Scandinavia (25% beauty)
- [ ] **MEDIUM: Ansök till Kronans Apotek på Awin** (3:e största apotekskedjan, ~18% market share, 325+ apotek)
- [ ] **HIGH: Resolve Apotek Hjärtat-restriktion** - deras villkor exkluderar advisory content om medicines/diseases/health/lifestyle. Bloggens kollagen-artiklar matchar precis det. Risk: existing affiliate-länk kan revoke:as om Awin auditerar. Kontakta `marcus.petersson@awin.com` för clarification innan skalning.
- [ ] **LOW: Andra nätverk** (efter Adtraction är max:ad): Daisycon, Sovrn, Adrecord. Skip Tradedoubler (inga relevanta brands för supplement/sleep-nischen).
- [ ] **LOW: Voucher/promo-code-injektion** - Awin + Adtraction har voucher-feeds. Rabattkoder i artiklar boost:ar CTR. Bygg en `injectVoucherCodes` analog till `injectAffiliateLinks` när engagement-data behöver lyftas.

Full research + DB-state + integration-details: `memory/affiliate-networks.md`. När env vars är på plats: sync-cron fyller `affiliate_programs` table automatiskt och `injectAffiliateLinks` i blog-autopilot börjar wrapping brand-mentions i affiliate-länkar.

## Wiki Retrieval Implementation (2026-05-18, BLOCKED på Williams beslut)

Bygg ut Williams setup så Claude faktiskt LÄSER wikis vid copy-uppgifter. Full evidence-base + 4-prio-plan i `memory/wiki-retrieval-best-practice.md`. Nav Toor's 7-layer-architecture applicerad på Williams Claude Code-flöde.

- [ ] **HIGH: Prio 1 - Symlink wikis -> memory/** (5 min, low risk). Symlinka `wiki/topics/{copy-blocks-framework,rmbc-method,copycoders-claude-code-automations,ai-creative-strategist-mastery,copycoders-ai-bots-iro-sherlock}.md` in i `~/.claude/projects/-Users-williamhedin-Claude-Code/memory/`. Lägg pointers i MEMORY.md med READ-triggers per copy-typ. (added 2026-05-18)
- [ ] **HIGH: Prio 2 - Voice-guide-filer per brand** (30 min, blocked på Williams samples). Nav Toor's Layer 4 - största gapet i Williams setup. Behöver 3 best emails + 1 podcast/video-transcript per brand: voice-guide-renew.md (i SharedVault/renew/), voice-guide-happysleep.md (i SharedVault/happysleep/), voice-guide-marie.md (i doginwork/). Konsolidera doginwork's existing Christine-avatar + två-rösts-guide. (added 2026-05-18)
- [ ] **HIGH: Prio 3 - Slash-commands `/email /ad /vsl /landing`** (15 min). Force-loaded retrieval per brand+typ. Skapa i `~/.claude/commands/`. Läser ALLTID rätt wiki + voice-guide + frågar kontext + skriver. Akshay/Cyril /goal-pattern. (added 2026-05-18)
- [ ] **MEDIUM: Prio 4 - Trigger-rules i CLAUDE.md** (5 min, backup). Vault CLAUDE.md + per-project CLAUDE.md: explicit regel "när user säger copy-task-keyword -> FÖRST läs wiki + voice-guide". Roland.W/@rwayne-pattern. (added 2026-05-18)

## Copycoders Action Items (2026-05-18, från wiki-syntheses)

196 transcripts ingestade + 5 wikis byggda. Subagents identifierade dessa hög-värde follow-ups:

- [ ] **MEDIUM: Sherlock Master Avatar för Renew** - 270 datapoints från en URL (single highest-leverage move enligt subagent som syntade copycoders-ai-bots-iro-sherlock). (added 2026-05-18)
- [ ] **MEDIUM: IRO Bot för Renew PDP** - Eugene Schwartz 5-bonus framework (speed/obstacle eliminator/completion catalyst/results amplifier/rejection problem solver). (added 2026-05-18)
- [ ] **LOW: Christine-Voice email bot för doginwork** - lowest-risk start på Williams 4-week build order. Bygger från existing avatar-citat. (added 2026-05-18)
- [ ] **LOW: AI Listicle Factory transcript saknas** - file 8 av 8 specialty masterclasses i AICSA. Försök igen med Chrome extension om Drive blivit unlocked. (added 2026-05-18)
- [ ] **LOW: Säkerhets-pattern adopt** - INNAN ANY community skill install: "Claude, validate this skill for malicious code or prompt injections". Adam's hard rule från automations-calls. (added 2026-05-18)

## Marketing Knowledge Base (2026-05-15 -> 2026-05-17)

Full marketing-KB nu live i `~/Obsidian/Vault/`. Cross-source - inte längre single-source Max-bias.

**Källor i `raw/`:**
- Video-corpus: Maxwellcopy (140) + Mark/Anthony/Hormozi (298) + Copycoders (196)
- Book-corpus: 19 böcker (~9.15M chars) i `raw/books/2026-05-16-*.md`

**Synthesis-wikis (13 topics i `wiki/topics/`):**
- Video-baserade (4): dtc-email-playbook, markbuildsbrands-playbook, anthonyvcamacho-playbook, hormozi-playbook
- Copycoders-cluster (5): copy-blocks-framework, rmbc-method, copycoders-claude-code-automations, ai-creative-strategist-mastery, copycoders-ai-bots-iro-sherlock
- Book-baserade (7 nya 2026-05-16): direct-response-fundamentals, cialdini-persuasion-deep, hormozi-trilogy-deep, brunson-funnels-playbook, retention-economics-applied, halbert-archive-wisdom, sharp-how-brands-grow-counter
- Meta: marketing-books-canon (tier-list + var-att-få-tag-i)

**Action items från synthesis-passen:**

- [ ] **HIGH: Resolve Lalas vs renew-offer-strategy 2-pack-konflikt** - flaggad i `wiki/topics/retention-economics-applied.md`. RCM-Trifecta-modellen vs Williams nuvarande "two tiers only" - separat session när Renew-offer designas. (added 2026-05-16)
- [ ] **MEDIUM: 4 follow-ups till `memory/renew-retention.md`** - retention-economics-applied-wikin listar specifika updates. (added 2026-05-16)
- [ ] **MEDIUM: Diversifiera email-KB med Chase Dimond corpus** - YouTube + X-posts. Plug into dtc-email-playbook.md med citations. (added 2026-05-15)
- [ ] **MEDIUM: Diversifiera med Val Geisler** - warm-tone welcome series, hennes "Save Your Cookie"-content. (added 2026-05-15)
- [ ] **MEDIUM: Diversifiera med Stefano Apostolakis** - DTC-specific tactics. (added 2026-05-15)
- [ ] **LOW: Andra creators batch-fetch** - använd `memory/youtube-transcript-bulk-workflow.md` pipeline. (added 2026-05-15)
- [ ] **LOW: Renew email-flows-impl-doc** i SharedVault - applicera dtc-email-playbook + retention-economics-applied på Renew. (added 2026-05-15, expanderat 2026-05-16)
- [ ] **LOW: HappySleep email-flows-impl-doc** i SharedVault - sleep-supplement-specific tactics. (added 2026-05-15)
- [ ] **LOW: Hitta Breakthrough Advertising (Schwartz)** - enda gap i canon. Brunson Box / Boardroom Reports reprint. (added 2026-05-16)
- [ ] **LOW: Bond Halberts publicerade Boron Letters-samling** - free archive har bara kap 1-4, 16, 20 av 25. Köp om du vill ha hela. (added 2026-05-16)
- [ ] **LOW: Bättre Caples Tested Advertising Methods-PDF** - befintlig är OCR-korrupt, principerna rekonstruerade från cross-cites i andra böcker. (added 2026-05-16)

## Klaviyo for Doginwork (active 2026-05-13)

Klaviyo aktiverat med Private API key i `.env.local`. Account är tomt men foundation finns. Full state: `memory/klaviyo-doginwork.md`. Critical replacement for broken Shopify Flow native abandoned-checkout mail. **Wiki-backing finns nu: [[Obsidian/Vault/wiki/topics/dtc-email-playbook.md]] för full Max-playbook-context.**

- [ ] **HIGH: Bygg cart-abandonment 3-mejls flow i Klaviyo** - Trigger på `Checkout Started`, filter: not in `Placed Order` since trigger. Mejls 1h/24h/72h. Maries voice + verified testimonials (Heléne/Jenny/Petra). Korrekt 997 kr pris. NO "lydnad", NO "Marie's"-genitiv. Replaces Shopify Flow native flow som har 6 issues (fab testimonials, fel pris, hard-rule violations). (added 2026-05-13)
- [ ] **HIGH: Stäng av Shopify Flow "Recover abandoned checkout"** efter Klaviyo-version live + verifierad. (added 2026-05-13)
- [ ] **MEDIUM: 8 quiz-pain-segments i Klaviyo** per `doginwork/docs/quiz-strategy.md`. Custom profile properties: quiz_primary_pain, quiz_age_bracket, quiz_breed_cluster, quiz_severity, quiz_completed, quiz_purchased. Wire quiz-runtime att pusha events via Klaviyo Profiles API. (added 2026-05-13)
- [ ] **MEDIUM: Post-quiz email-flow per segment** - 3-7 mejl per pain-segment med merge-tagged copy. Kräver email-capture-step i quiz först. (added 2026-05-13)
- [ ] **LOW: Verifiera Klaviyo-Shopify profile sync** - 300+ av 698 synkade. Otydligt om pågående eller stopped. (added 2026-05-13)
- [ ] **LOW: Cleanup old draft flow "Köpt privat coaching"** - relikt från failed coaching-upsell-experimentet, aldrig aktiverad. (added 2026-05-13)
- [ ] **LOW: Email-capture step i quiz** - "Var ska vi skicka dina resultat?" på loading-skärmen (EveryDoggy-mönster). Kräver Klaviyo cart-flow + segments först. (added 2026-05-13)

## Valpkurs Sales Page (2026-05-13 → 2026-05-14, PENDING)

Två sales page-varianter live:
- `pages.doginwork.se/valpkurs/` - public, 1 499 kr (VALP500-rabatt)
- `pages.doginwork.se/valpkurs-erbjudande/` - subscriber secret, 997 kr (VALP2026)

**Full state**: spec v3 (`doginwork/docs/superpowers/specs/2026-05-14-valpkurs-sales-page-rewrite-v3.md`) + journal `2026-05-14-22-28-valpkurs-sales-page-v4-restructure.md` + `memory/valpkurs-sales-page.md`

### Done
- [x] ~~Infrastructure + V1-V2 builds~~ (tidigare sessions)
- [x] ~~V3 spec written, all 7 open decisions resolved + approved~~ (2026-05-14)
- [x] ~~V4 full SpiritDog Ultimate Puppy Program-mirror rebuild~~ (2026-05-14): hero + 5 problems pain + roadmap + future pacing + offer box + price comparison + 9-bullet qualifier + Marie + before/after + 87% stat + FAQ + urgency timeline + final CTA
- [x] ~~6 Higgsfield-bilder genererade + uploadade till Supabase~~
- [x] ~~Course content extraction: 11 Whisper-transkripter + 17 Tevello-sektioner~~ → `doginwork/docs/course-content/`
- [x] ~~VALP500 + VALP2026 discount-koder ACTIVE i Shopify~~ (skapad via API)
- [x] ~~Subscriber secret-page (`/valpkurs-erbjudande`) deployad med hardcoded medlemspris~~
- [x] ~~Native Swedish copy-pass (anglicismer borta: roadmap, 1-on-1-coaching, subscriber, timing, etc.)~~

### Pending (next session)
- [ ] **HIGH: Klaviyo popup-form + nurture-flow** - sätt upp i Klaviyo dashboard. Popup på public sales page (scroll 50% + exit-intent). Form-submit triggers nurture-flow som mailar subscriber-URL (`/valpkurs-erbjudande`). Fyll i `KLAVIYO_COMPANY_ID` placeholder i `doginwork/scripts/sales_page_html_body.py` och re-deploy båda varianter.
- [ ] **MEDIUM: Trustpilot-recensioner** - extrahera 3 riktiga från trustpilot.com/review/doginwork.se, ersätt placeholder-copy i före/efter-section.
- [ ] **MEDIUM: LCP-optimering** - hero-image fortfarande stor. Resize till ~600px för mobile för bättre Lighthouse-score.
- [ ] **LOW: PR #1 merge** - `feat/valpkurs-sales-page` branch när Klaviyo + Trustpilot är klara.
- [ ] **LOW: Cleanup `smoke-publish-doginwork.ts`** efter PR merged.

### Future (out of scope nu)
- [ ] Listicle build (separat sida på `pages.doginwork.se/{slug}`) - per spec section "next funnel piece"
- [ ] Google Ads-spår (vänta på Williams Google-access)
- [ ] Real customer testimonial photos när Marie levererar (currently AI-Higgsfield)

---


## Before/After generator tool (2026-05-11 → 2026-05-14)
Tool in `/assets`. Architecture in `memory/before-after-tool.md`. Hard rule: `feedback_before_after_halves_should_differ.md`.

### Done (2026-05-14 deep iteration session, 9 commits)
- [x] ~~Build whole stack (component, 3 API routes, 11 zone thumbnails via Higgsfield, auto-detect, auto-trigger, swipe vs create modes)~~ (done 2026-05-11)
- [x] ~~Integrate NANO BANANA PRO PROMPT.pdf spec technique (spec-as-prompt with preserve_original: true)~~ (commit `8e3e674`, 2026-05-12)
- [x] ~~Restore pose variation in create mode (regression from b71f348 fixed)~~ (commit `6b03b7e`, 2026-05-14)
- [x] ~~Prevent mirror-flip from L+R head lean pairing (pickHeadTilts side-locked, BODY_ORIENTATIONS shared)~~ (commit `a8d1e5d`)
- [x] ~~Lock permanent skin features without naming them (de-priming fix - feature-agnostic constraint)~~ (commits `2614681` + `b17daee`)
- [x] ~~Add Nails template (NAIL_INTENSITY_PROMPTS, isNails branch, NAIL_HAND_POSES, NAIL_BACKGROUNDS, generated thumbnail)~~ (commits `aff3fb0` + `e71e537`)
- [x] ~~Fix tiling (forehead/eye/chest) + vertical-flip (limb) generation artifacts~~ (commit `09642dc`)
- [x] ~~Add Hair template based on Nutrafol/Viviscal/Vegamour research (parting-line narrowing + baby hairs as positive cues)~~ (commit `5f261e6`)
- [x] ~~Random age pool starts at 46 (RANDOM_AGE_POOL filter)~~ (commit `ef333e9`)

### Pending / open
- [ ] **Verify next user generation per zone after 2026-05-14 fixes** - especially forehead (tiling), leg/arm (orientation), hair_scalp (parting-line + baby hairs), face/cheek/eye (pose regression check)
- [ ] **Resume swipe mode** when create mode settled - currently PAUSED per William. Options when revived: Higgsfield role-tagged `medias`, Replicate InsightFace face-swap, or accept as "style inspiration only"
- [ ] Add more body zone templates if William wants more variety (he mentioned this after analyzing 48 competitor B/A images)
- [ ] Remove unused `vision` parameter from `buildPrompt` in swipe branch (leftover from spec-based refactor)

## Knowledge Architecture Upgrade (started 2026-05-13)

### Done
- [x] Obsidian installed (v1.12.7 at `/Applications/Obsidian.app`)
- [x] Vault created at `~/Obsidian/Vault/` med raw/wiki/outputs/-struktur
- [x] Raw X-posts om second brain + Hermes sparade i vault/raw/
- [x] Synthesis-patterns.md skriven i vault/wiki/
- [x] Privat GitHub-repo `willehedin95-ui/obsidian-vault` skapad
- [x] Obsidian Git plugin installerad + konfigurerad (auto-sync var 5:e min)
- [x] Memory/ migrerat till vault (91 filer) + symlink från `.claude/projects/.../memory/` (2026-05-13)
- [x] Vault schema (CLAUDE.md) + 7 kommandon (/save, /save idea, /wiki, /query, /brief, /lint, /memory) (2026-05-13)
- [x] raw/-subfolders per källtyp (x/, articles/, videos/, podcasts/, books/, meetings/, notes/, assets/) (2026-05-13)
- [x] ideas/, wiki/{topics,entities,concepts}/, outputs/{briefs,reports}/ skapade (2026-05-13)
- [x] index.md + log.md (Karpathy specialfiler) (2026-05-13)

### Active (where we are now)
- [ ] **Cleanup-audit av MEMORY.md + per-project CLAUDE.md** - MEMORY.md har vuxit till ~22KB / 195 rader sen audit 2026-04-09 (då gick det från 66KB → 9KB). Dubbel-laddas per turn = ~28k tokens/meddelande. Behöver flytta detalj till topic-filer, behålla pointers. **Research först:** kolla X för current best practices på CLAUDE.md / AGENTS.md / memory-files (2026 patterns). Då vet vi hur man borde strukturera, sen audit alla projekt: content-hub, doginwork, huskop, cykel-pvp, eps-ventiler, plus den globala MEMORY.md. (added 2026-05-13)
- [ ] **Bestäm projects/-folder struktur i vault** - hur ska content-hub, doginwork, huskop, cykel-pvp, eps-ventiler representeras i vaulten? (Just nu finns de bara som mappar i `~/Claude Code/`)

### Deferred (parkerat 2026-05-13)
- [ ] **Hermes Agent setup** - parkerat tills vidare. Plan: Hostinger VPS KVM2 (~$10-15/mo) + Codex OAuth via ChatGPT Business (nästan gratis tokens) + Telegram bot + GitHub-sync mot vault. Use cases William prioriterar: voice-message tankar på promenader, automatiska weekly synthesis söndagar, morgon-brief 07:00. Fortsätter när vault-strukturen är stabil. Reference X-posts + video transcripts sparade i `~/Obsidian/Vault/raw/2026-05-13-*.md`.
- [ ] **Web Clipper alternativ till existing X-extension** - din egen Chrome extension scrapar X-poster bättre än Obsidian Web Clipper. TODO: modifiera den så den sparar direkt till `~/Obsidian/Vault/raw/x/` istället för clipboard.
- [ ] **Rasmus shared vault** - när du har egen workflow stabil, sätt upp separat SharedVault för delade projekt-insikter. Git-sync via gemensam privat repo.

(Original plan från 2026-05-08 borttagen - ersatt av denna live status)

## Quiz Editor UX (2026-05-03)
- [ ] **A/B variants as tabs on a single canvas node** — Today the editor renders each variant in a variant group as a separate side-by-side node connected with edges (e.g. Landing A → Landing B → Block 1). Visually misleading - looks like sequential steps but the runtime resolves to ONE variant per session via `resolveNode(variantGroupId)`. Refactor `QuizEditorClient.tsx` (and the React Flow node renderer) so variants in a group collapse into a single "card with A/B/C tabs" node. Sidebar should also list each variant indented under its parent step. Files: `src/app/quizzes/[id]/edit/QuizEditorClient.tsx`, the React Flow custom node component. (added 2026-05-03)

## Blog Autopilot V2 (2026-04-21)
Three major upgrades landed. All running in production for Hydro13; HappySleep defaults off.

- [x] ~~**SEO pipeline fixes**~~ — Anti-slop post-processor, internal-link distinguishing-term matcher, image perf attrs (lazy/width/height/fetchpriority). Re-processed 16 Hydro13 articles: 0.9 → 9.7 avg internal links, 27 banned words replaced. Commit `d21e299`. (done 2026-04-21)
- [x] ~~**Shopify blog publish path**~~ — Hydro13 routes to `get-renew.com/blogs/kollagen/*` via Admin API instead of CF Pages. Files: `shopify-blog.ts`, `shopify-blog-publish.ts`. All 16 articles migrated with Shopify CDN images + width params + scoped CSS (px not rem, Shopify theme uses :root{10px}). Commit `c425acf`. (done 2026-04-21)
- [x] ~~**Per-day article cap (configurable)**~~ — `blog_autopilot_max_per_day` workspace setting replaces hardcoded 2. Hydro13 = 1/day on new domain. Commit `0bd4424`. (done 2026-04-21)
- [x] ~~**#1 PubMed-grounded citations**~~ — `src/lib/pubmed.ts` fetches 5-10 verified peer-reviewed studies per article via E-utilities. Writer post-process requires ≥3 verified URLs cited; retries once if short. Opt-in via `blog_research_citations`. Commit `22e8b1d`. (done 2026-04-21)
- [x] ~~**#2 GSC gap detection cron**~~ — `/api/cron/gsc-gap-refresh` Mondays 06:00 UTC auto-populates `blog_content_plan` from queries with impressions but no dedicated article. Dedupes via normalized keyword + slug. Commit `1d1fe96`. (done 2026-04-21)
- [x] ~~**#3 Soft quality gate + review UI**~~ — 9 static checks on generated HTML. Fail → status=`pending_review` + Telegram ping + operator approves via `/blog-review`. Opt-in via `blog_soft_gate_enabled`. Commits `423b9b5`. (done 2026-04-21)
- [ ] **"Update existing article" path for `low_rank` gaps** — Gap detector currently surfaces `low_rank` (pos 5-20) but only actions `no_article`. Build update-existing autopilot mode: regenerate body with GSC-informed keyword targeting, republish. (added 2026-04-21)
- [ ] **Auto-sunset stale articles** — Articles with avg position >30 after 90 days should be archived (or flagged for rewrite). Prevents Google from rating domain on the weakest 20% of content. (added 2026-04-21)
- [ ] **GA4 integration on SEO tab** — `src/lib/ga4.ts` exists but no UI consumer. Surface pageviews/sessions/bounce alongside GSC data on `/seo?tab=articles` so we see traffic even before Google rankings exist. (added 2026-04-21)
- [ ] **Author bio system** — Current articles have no byline. When credentialed reviewer available (dietitian/nutritionist, ~1000-2000 kr/month), add author schema.org metadata + bio section in body. Boosts E-E-A-T on YMYL content. (added 2026-04-21)
- [ ] **Regenerate images for migrated articles** — Existing 16 Hydro13 articles still have English text in AI-generated images (EFSA screens, "GLOW FORMULA" bottles). Prompt fix for future articles landed 2026-04-21. To fully clean: $4 + 30min to regen via Kie AI with updated prompt. William deferred. (added 2026-04-21)

## Resilience Audit (triggered by halsobladet manifest wipe 2026-04-16)

## Resilience Audit (triggered by halsobladet manifest wipe 2026-04-16)
**Full report**: `.claude/tasks/resilience-audit-2026-04-16.md`

### P0 - same-class-of-bug, fix NOW (est 2-3h)
- [ ] **Settings PUT atomic merge** — `/api/settings/route.ts` overwrites entire `workspaces.settings` JSONB. Add Postgres RPC `merge_workspace_settings` (same pattern as `merge_cf_pages_manifest`) + convert callsite. (added 2026-04-16, CRITICAL)
- [ ] **ad_copy_translations atomic merge** — 2 places do JSONB RMW: `approval-actions.ts:327-348` + `autopilot-translations.ts:251+389`. Approval + autopilot can overwrite each other. Add RPC + convert. (added 2026-04-16, CRITICAL)
- [ ] **Un-fire-and-forget sitemap/homepage/RSS** — `publish/route.ts:245-258` + `blog-autopilot.ts:374-379` use `.catch(() => {})`. If these fail, user sees "published" but blog homepage/RSS is stale with no alert. Await them, log failures, Telegram on failure. (added 2026-04-16, CRITICAL)
- [ ] **Auto-kill real-time Telegram alert** — `autopilot-execute` pauses up to 10 adsets/day silently. Make `pauseAdSetAndAds` throw on partial failure, send Telegram per kill with before-state + undo button. (added 2026-04-16, HIGH)

### P1 - prevent silent production failures (est 3-4h)
- [ ] **Post-deploy URL verification** — After `createDeployment()`, fetch URL, check 200 + body > 500 + `</html>`. Retry 3x. Only then mark published. Would have caught halsobladet within seconds. (added 2026-04-16)
- [ ] **Pre-Meta-push landing URL check** — Before creating Meta ads, HEAD the landingUrl (5s timeout). Skip languages where URL 404s. Prevents ads pointing to dead pages. (added 2026-04-16)
- [ ] **loadWorkspaces throws instead of `[]`** — `workspace.ts:20-28` returns `[]` on DB error, locks user out of app. Throw instead. (added 2026-04-16)
- [ ] **pauseAdSetAndAds error collection** — `meta.ts:318-338` swallows per-ad failures. Collect into array, throw after loop. (added 2026-04-16)
- [ ] **scale_winner budget upper bound** — `morning-brief/actions:146-152` has no max. Cap at `max_campaign_budget` from workspace settings + 24h cooldown. (added 2026-04-16)
- [ ] **createDeployment/loadManifest retry** — Wrap in `withRetry()`, single network hiccup shouldn't fail deploys. (added 2026-04-16)

### P2 - hardening (incremental)
- [ ] **Meta ad readback verification** — 30s delayed fetch to verify ad exists + correct adset/creative after push. (added 2026-04-16)
- [ ] **Ad impression delay alert** — hourly cron: query insights for ads pushed 2-6h ago. Alert if 0 impressions. (added 2026-04-16)
- [ ] **API wrapper response.ok checks** — `apify.ts`, `gethookd.ts` missing. Also fix `shopify.ts` `data.orders ?? []` silent drop. (added 2026-04-16)
- [ ] **Auto-kill before-state snapshot** — log `adset_state_before` JSONB to `autopilot_actions` so kills are reversible. (added 2026-04-16)
- [ ] **Concept metrics payload validation** — `pipeline.ts:836` upserts NULL on truncated Meta response, zeroing historical spend. Validate required fields first. (added 2026-04-16)
- [ ] **Soft-delete lifecycle/pages** — Replace `.delete()` with `archived_at` on `concept_lifecycle`, `pages` error cleanup, `source_images` iteration cleanup. (added 2026-04-16)
- [ ] **Post-deploy sanity check cron** — every 30min, fetch all active Meta ad landing URLs + top blog URLs. Would have caught halsobladet within 30min. (added 2026-04-16)
- [ ] **Deploy audit log table** — `cf_pages_deploy_log` tracking manifest_size_before/after, files_uploaded, url_status. Debug future incidents. (added 2026-04-16)
- [ ] **Lint rule: silent error patterns** — flag `catch (e) {}`, `.catch(() => {})`, `.single()` without error destructure, `.update()`/`.delete()` without id/workspace_id in WHERE. (added 2026-04-16)

## Renew Launch
- [x] ~~**Meta infrastructure**~~ — Ad account `act_1356397096506086`, Page "Renew Sverige", Pixel `2023081985301786`, system user access, workspace config updated. (done 2026-03-25)
- [x] ~~**Shopify Pixel + CAPI**~~ — Facebook & Instagram sales channel (Maximum), verified pixel firing on get-renew.com. (done 2026-03-25)
- [x] ~~**Email DNS (SPF/DKIM/DMARC)**~~ — All records configured on Hostinger. Klaviyo branded sending domain `send.get-renew.com` verified. (done 2026-03-25)
- [x] ~~**Freshdesk auto-reply + primary mailbox fix**~~ — Stabilized `/api/fillout-to-freshdesk` back to standard `/tickets` endpoint (no outbound_email). Added Freshdesk EU Central to SPF (`fdspfeuc.freshemail.io`). User manually set `kundservice@get-renew.com` as primary mailbox in Freshdesk UI (API doesn't support PUT on email_configs). (done 2026-04-07)
- [x] ~~**Google Postmaster Tools verification**~~ — All 4 domains verified: get-renew.com, swedishbalance.se, swedishbalance.org, doginwork.com. TXT records added via Hostinger API. (done 2026-04-07)
- [x] ~~**SPF gaps: doginwork.com + swedishbalance.org**~~ — doginwork.com now includes Shopify (`shops.shopify.com`), swedishbalance.org now includes Klaviyo (`_spf.klaviyo.com`). Both had DKIM but were missing SPF includes. (done 2026-04-07)
- [ ] **GA4 + GTM** — Set up new GA4 property + GTM container for get-renew.com. (added 2026-03-25, GSC done 2026-04-21)
- [x] ~~**GSC verify get-renew.com**~~ — Verified as `sc-domain:get-renew.com` via Site Verification API + Hostinger DNS. Service account is siteOwner. Script: `scripts/verify-get-renew-gsc.ts`. (done 2026-04-21)
- [ ] **Shopify policies** — kontaktformulär + returformulär still missing. (added 2026-03-25)
- [x] ~~**Klaviyo from-address**~~ — `hello@get-renew.com` already set as default sender in Klaviyo. No mail sent from Klaviyo yet (only Freshdesk test tickets). So "From: header alignment" warning in Postmaster is likely from Freshdesk tests, not Klaviyo. Will confirm when first Postmark DMARC Weekly report arrives. (done 2026-04-07)
- [x] ~~**Ad account warmup**~~ — Renew ad account active. CBO campaign `120247585560870715` (1000 SEK/day, Lowest Cost, PAUSED). Template ad set with Renew Pixel + Advantage+ audience. William + Rasmus granted full access. DSA fields added to meta.ts. (done 2026-04-10)
- [x] ~~**Update Hydro13 blog product URLs**~~ — blog-writer.ts + market_product_urls DB all updated to `https://get-renew.com/products/hydro13` (SE/NO/DK). Commit `03740c5`. (done 2026-04-10)
- [ ] **Custom sending domain for Loop (LOW)** — Loop currently sends from default `notifications.loopwork.co`. Could add own subdomain like `notifications.get-renew.com` to separate transactional from Klaviyo marketing (`send.get-renew.com`) and avoid shared-reputation risk. Main concern is sender/reply-to domain mismatch (currently sends from @loopwork.co, replies to @get-renew.com) which may trigger spam flags. Not urgent - default works. When ready: add new domain in Loop → they give DNS records → add via Hostinger API. (added 2026-04-07)
- [ ] **Test Renew auto-reply end-to-end** — Submit Fillout contact form with real email, verify (1) auto-reply arrives from `kundservice@get-renew.com` not Freshdesk, (2) lands in inbox not spam, (3) reply thread works correctly. doginwork + swedishbalance send daily automated mail so no testing needed for those. (added 2026-04-07, HIGH before ads go live)
- [ ] **Investigate "From: header alignment" warning in Postmaster Tools** — get-renew.com Postmaster shows "Needs work" on From header alignment. Means some mail with From: @get-renew.com is failing DMARC alignment (neither SPF nor DKIM d= tag matches the From domain). Most likely source: Klaviyo not yet using branded sending domain (hello@get-renew.com not set as default sender), or Fillout confirmation emails. Investigate once Postmark DMARC Weekly reports are flowing. (added 2026-04-07)
- [x] ~~**Postmark DMARC Weekly (get-renew.com only)**~~ — DMARC on get-renew.com set to Postmark rua: `v=DMARC1; p=none; pct=100; rua=mailto:re+ssarjlvm9iu@dmarc.postmarkapp.com; sp=none; aspf=r;`. Verified via Postmark API (`/records/my/verify` returns `verified:true`). **Postmark free is one-domain-per-account** - swedishbalance.se/.org + doginwork.com reverted to default `v=DMARC1; p=none` (no rua). Can add them later as separate Postmark accounts if needed. **Replaces SNDS/JMRP** (not usable for solopreneurs on shared sending infrastructure). Postmark API token saved in `.env.local` + Vercel env (production + dev only - preview pending manual add) as `POSTMARK_DMARC_API_TOKEN`. (done 2026-04-07)
- [ ] **Read first Postmark DMARC Weekly report** — Arrives ~1 week from 2026-04-07. Look for: (1) any unauthorized IPs sending as @get-renew.com, (2) which source is failing alignment (the Postmaster Tools warning), (3) SPF/DKIM pass rates at Gmail vs Outlook vs Yahoo. Can also pull via API: `GET https://dmarc.postmarkapp.com/records/my/reports` with `X-Api-Token` header. (added 2026-04-07)
- [x] ~~**Postmaster API integration (plumbing)**~~ — Gmail Postmaster Tools API enabled on `claude-code-william` project (via Service Usage REST API, no gcloud CLI needed). Service account key copied to `content-hub/credentials/google-cloud-service-account.json` (gitignored). `GOOGLE_APPLICATION_CREDENTIALS` env var set in `.env.local`, `GOOGLE_SERVICE_ACCOUNT_JSON` (stringified JSON) set in Vercel production + development. Service account email: `claude-code-william@claude-code-william.iam.gserviceaccount.com`. API scope: `https://www.googleapis.com/auth/postmaster.readonly`. **BLOCKED on manual delegation** — Postmaster Tools doesn't support IAM federation; domain owner must add service account email as a "user" in the Postmaster Tools UI per domain (get-renew.com, swedishbalance.se, swedishbalance.org, doginwork.com). Until then, `GET /v1/domains` returns `{}`. (done 2026-04-07)
- [x] ~~**Content Hub deliverability dashboard**~~ — Built `/deliverability` page (combined view of Gmail Postmaster Tools + Postmark DMARC). Daily cron at 12:00 UTC, stores snapshots in 3 new tables (`postmaster_traffic_stats`, `dmarc_reports`, `deliverability_sync_log`). Telegram alerts at >0.3% (warning) and >1.0% (critical) spam rate, and on >10% DMARC fail ratio. Manual "Sync now" button in UI. **Initial sync exposed real issue**: swedishbalance.org on LOW reputation for all 19 days, with spam rate spikes to 1.0% (2026-03-08) and 0.8% (2026-03-13). Gmail is not trusting it — needs investigation (likely Klaviyo sending to stale list). DKIM/SPF/DMARC all 100% so auth isn't the problem, it's engagement. swedishbalance.se + doginwork.com + get-renew.com have no Postmaster data yet (volume below reporting threshold). (done 2026-04-07)
- [ ] **Gradual DMARC policy strengthening** — All 4 domains currently on `p=none`. Once Postmark DMARC Weekly reports show clean authentication for 2-4 weeks, advance to `p=quarantine; pct=25` → `pct=100` → `p=reject`. Don't rush this. (added 2026-04-07)
- [x] ~~**Delegate Postmaster Tools to service account**~~ — User added `claude-code-william@claude-code-william.iam.gserviceaccount.com` as READER on all 4 domains (get-renew.com, swedishbalance.se, swedishbalance.org, doginwork.com). API verified: `GET /v1/domains` returns all 4 with `permission: READER`. Traffic stats confirmed working: swedishbalance.se + swedishbalance.org show `domainReputation: HIGH` (Gmail trusts them). get-renew.com + doginwork.com have no data yet (need ~10 mail/day to Gmail users to trigger reporting). (done 2026-04-07)

## Expense Report & Invoice Tracker
- [x] ~~**Expense Report feature**~~ - Upload receipts + bank screenshots, AI extracts data in Swedish (Haiku), matches receipts to bank transactions, generates Excel with payment section, downloads receipts as ZIP. Client-side ZIP (JSZip) to avoid Vercel body limit. Commits `9748f68`, `c13f026`, `f21649c`, `c973d9f`. (done 2026-04-11)
- [ ] **Invoice Tracker redesign Phase 1** - Fix email matching (forwarded emails lose original sender, WisprFlow matches everything). Add `extractOriginalSender()`, two-pass matching, `original_sender` column, fix WisprFlow config, reassign wrongly-matched logs. (plan ready)
- [ ] **Invoice Tracker redesign Phase 2** - Simplify statuses (9 -> 6 stored + 2 computed). Data migration SQL. (plan ready, depends on Phase 1)
- [ ] **Invoice Tracker redesign Phase 3** - UI cleanup: consolidate banners, consolidate actions, simplify rows, handle 518 stuck pending logs. (plan ready, depends on Phase 2)

## Tier 1 — Revenue & Automation
- [x] ~~**Multi-workspace hardcoding audit**~~ — Full codebase audit (4 parallel agents), fixed 24 files. Removed pausedProducts hiding Hydro13, hardcoded pillow descriptions, `|| "happysleep"` fallbacks, collagen-specific research prompts, HappySleep-specific blog language rules. Commits `69dea06`, `f80afda`. (done 2026-03-27)
- [x] ~~**Workspace-aware language options**~~ — Hydro13 now only shows Swedish. `WorkspaceProvider` + `useWorkspaceLanguages()` hook, 10 components + 8 API routes updated. Commit `907130c`. (done 2026-03-27, by Paperclip CEO agent)
- [x] ~~**Fix ad-performance-sync multi-workspace**~~ — Refactored to collect all unique ad accounts (env vars + workspace meta_config), sync each sequentially. Commit `f3057d5`. (done 2026-04-04)
- [x] ~~**Fix pipeline/concepts approve route**~~ — Investigated: the `pipeline_concepts` table doesn't exist (dead code from superseded design). Active approve flow works via `/api/brainstorm/approve`. No fix needed. (resolved 2026-04-04)
- [x] ~~**Improve landing page auto-picker**~~ — Replaced 4-tier auto-logic with explicit `primary_landing_pages` workspace setting (default + per-angle). A/B page testing disabled (budget fragmentation). Commit `5765425`. (done 2026-03-31)
- [ ] **Full autopilot (no approval)** — End goal: remove human approval step entirely. Autopilot generates concepts, translates, picks landing page, pushes to Meta — zero intervention. Requires: good landing page picker, high concept quality, reliable translations. Evaluate output quality first. (added 2026-03-29)

## Tier 1.5 — Immediate Follow-ups
- [x] ~~**Commit remaining uncommitted changes**~~ — All changes committed and pushed in `7c4dd2f`. Includes CF Pages .trim() fix, bleeder kill logic, blog page filter, autopilot upgrades. (done 2026-03-30)
- [x] ~~**Fix autopilot JSON parse crash**~~ — Added `repairJson()` to `concept-generator.ts` (trailing commas, control chars). Two-attempt parsing with better error messages. Commit `603efb2`. (done 2026-03-30)
- [x] ~~**Landing page health check cron**~~ — `/api/cron/landing-page-health` at 05:00 UTC. Checks all active Meta ad landing pages for HTTP 200 + valid HTML. Telegram alert on failure. Commit `6246d76`. (done 2026-03-30)
- [x] ~~**Review card improvements**~~ — Landing page name shown, clickable images/titles to detail pages. Commit `603efb2`. (done 2026-03-30)
- [x] ~~**JSON prompting for native ads**~~ — native-closeup + native-messy now use structured JSON prompts (14 keys) via Kie AI. Feature flag `USE_JSON_PROMPTING`. Both static ad pipeline + competitor swipe. Commit `0635b5c`. (done 2026-03-30)
- [x] ~~**Fix [LÄNK] placeholder in ad copy**~~ — Prompt rules in brainstorm.ts + translation prompts + meta-push safety net. Commit `cd6afc9`. (done 2026-03-31)
- [x] ~~**Fix board dropdown mixing workspaces**~~ — Ad Spy board list now filters by workspace `gethookd_board_ids`. Commit `cd6afc9`. (done 2026-03-31)
- [x] ~~**Fix Telegram webhook unregistered**~~ — Re-registered webhook URL via `setWebhook` API. Buttons now work. (done 2026-03-31)
- [x] ~~**Monitor HappySleep DK recovery**~~ — DK never recovered. Halved budget from 1050 → 525 SEK/day on 2026-04-07 to reduce bleed while we wait for Hydro13 + new HS concepts. (done 2026-04-07)
- [ ] **Push + test JSON prompting** — Push `0635b5c` to Vercel, generate test concepts, compare native ad image quality. If worse, flip `USE_JSON_PROMPTING = false`. (added 2026-03-30, HIGH)
- [ ] **Monitor tomorrow's autopilot board swipe** — Verify 08:00 UTC cron swipes 3 board ads per workspace (not from_scratch). (added 2026-03-31)
- [ ] **Telegram webhook health check** — Consider adding a cron or startup check that verifies webhook is registered, re-registers if empty. (added 2026-03-31)
- [x] ~~**Verify cleanup-empty-adsets first scheduled run**~~ - 11 zombies paused at 10:37-10:52 UTC. Throttling held, no rate-limit errors. Working as designed. (done 2026-04-07)
- [x] ~~**Verify pipeline-push pushes Hydro13 #12-#18**~~ - #18 already in `testing` (pushed at 13:31 UTC). Others queued in launchpad, rolling out on cold-start cadence. (done 2026-04-07)
- [x] ~~**Investigate HappySleep autopilot failure streak**~~ - Two root causes. (1) `swipeCompetitorAd` ran 3 image gens **sequentially** (90-270s/concept) inside a cron with `maxDuration=300` - Vercel killed the cron mid-loop. Fixed by parallelizing via `Promise.allSettled` (commit `8b33087`). (2) Kie AI content safety filter rejecting prompts - silent failure mode. Fixed by adding soft-retry pass with stripped prompts + explicit Telegram alert (commit `c98e733`). Pipeline-push perf fixes also shipped (commit `5aff360` - batched concept_metrics upserts + skip already-paused ad sets). Also reverted maxDuration 800->300 because Vercel project is on hobby plan, not Pro/fluid (commit `565ad43`). Recovered #156 (completed) + #153/#157 (archived). (done 2026-04-07)
- [x] ~~**Consider deprecating finish-and-queue**~~ - Decided to keep. finish-and-queue handles draft to full pipeline including translations (manual brainstorm path). /review approve only handles already-translated ready concepts. Not redundant. (done 2026-04-07)
- [x] ~~**Push Hydro13 #12-#18 manually**~~ - All 6 Hydro13 SE concepts pushed to Meta via `scripts/push-one-concept.ts`. #18 was already pushed by pipeline-push earlier in the day. Lifecycle moved to `testing`. (done 2026-04-07)
- [x] ~~**Add soft retry + alert for failed swipe images**~~ - Both `swipe-competitor.ts` and `autopilot-concepts/runFromScratch` now: (1) detect when all images fail in main pass, (2) automatically retry with stripped prompts (no JSON, no overlays, no product appearance, no product hero refs), (3) send explicit Telegram alert if both passes fail. Also fixed latent bug in `runFromScratch` where status was set to `ready` even when 0 images succeeded. Commit `c98e733`. (done 2026-04-07)
- [ ] **Verify tomorrow's autopilot run actually succeeds** - After commits `8b33087` + `c98e733` + `565ad43`, the cron at 08:00/08:30 UTC should produce 3/3 successful concepts. Watch for: (a) does it fit in 300s budget post-revert (parallelization should make it feasible), (b) does soft retry trigger and recover any concepts that would have failed silently before. Look for `[swipe-competitor] Soft retry recovered N/3 images` log lines. (added 2026-04-07, HIGH)
- [ ] **Test /review approve/reject end-to-end** — Approve concept from phone, verify it lands on launchpad + translations trigger. (added 2026-03-29)
- [ ] **Consider removing Telegram inline buttons** — Once /review is proven stable, simplify Telegram messages to just a link. (added 2026-03-29, LOW)

## Renew Community (Facebook Group)
Strategic retention play. Kollagen kräver 60-90 dagar för synliga resultat - communityn hjälper kunder hålla ut förbi churn-fönstret (snitt 42 dagar). Inspirerat av Fresh Chile Co (36K members) och Obvi (46K members, kollagen).

- [ ] **Skapa Facebook-grupp** — "Renew - Hudresa & Kollagen" (eller liknande). Sluten grupp. Fyll i About, cover photo, regler. (5 min, HIGH - gör först)
- [ ] **10 startinlägg** — Förbered conversation starters: "Vilken vecka är du på?", "Hur tar du din Hydro13?", "Märker du skillnad efter X veckor?", resultat-timeline milstolpar, smoothie-recept med kollagen. (behövs innan inbjudning)
- [ ] **Bjud in befintliga subscribers** — Email-blast via Klaviyo/Well Copy till aktiva prenumeranter. Incentive: giveaway exklusivt i gruppen. (kräver Well Copy-koordination)
- [ ] **QR-kod i paketet** — Designa en liten flyer/kort med QR till gruppen. Lägg till i Shelfless plocklista. (kräver Shelfless-koordination)
- [ ] **Post-purchase email CTA** — Lägg till "Gå med i vår community" i Well Copy post-purchase flow. (kräver Well Copy-koordination)
- [ ] **iOS-app integration** — "Dela din milstolpe i gruppen" knapp vid streak/selfie milstolpar. Deep link till FB-gruppen. (kräver app-update + TestFlight)
- [ ] **Loop billing reminder CTA** — Lägg till social proof i upcoming order reminder: "X andra i gruppen tar sin Hydro13 idag". (LOW, vänta tills gruppen har aktivitet)
- [ ] **Glow Guide (lead magnet)** — Samla bästa community-tips, rutiner, och före/efter-resor till en PDF. Använd som post-purchase bonus och email lead magnet. (LOW, vänta tills tillräckligt med community-content finns)
- [ ] **UGC pipeline** — Processa community-bilder/testimonials till Meta ad creative. (LOW, kommer naturligt när gruppen växer)

## Tier 2 — Builder & UX Quality
- [x] ~~**Autosave race condition**~~ — Fixed in commit `f382c9b`. (done 2026-03-22)
- [ ] **Tune translation quality review prompt** — monitor Claude Haiku review results for false positives/negatives. Adjust strictness if needed. (added 2026-03-22)
- [ ] **Content Plan: Add Article button** — Let user manually add articles to the content plan from the UI (currently only added via migration script or autopilot). (added 2026-03-25)

## Tier 3 — Housekeeping
- [ ] **Sticky UTM on Renew Shopify PDP** — Variant selection strips `utm_campaign` from URL (seen on order #1009 with `landing_site: /products/hydro13?variant=...`). Add small JS to Shopify theme that stashes UTMs in sessionStorage and re-appends on variant/history navigation. Requires touching Renew theme - not Content Hub. (added 2026-04-21)
- [ ] **Investigate Rebuy/Kaching note_attributes for attribution** — Order #1010 had null landing_site/referring_site but Rebuy `Smart Cart 2.0` + Kaching `Bundles` attribution tags in note_attributes. Could mine these as additional source signal when standard fields are null. (added 2026-04-21)
- [ ] **Clean up stray `\n` suffixes in `.env.local`** — Many values quoted with literal `\n` before closing quote (CF_PAGES_*, ANTHROPIC_API_KEY, APIFY_TOKEN, etc.). `.trim()` doesn't strip them - caused CF API 404 this session. See `memory/debugging.md`. (added 2026-04-21)
- [ ] **Scope meta-ads dashboard by workspace** — `/api/meta-ads/dashboard` not filtering by workspace. (added 2026-03-27)
- [ ] **Scope usage route by workspace** — `/api/usage` not filtering by workspace. (added 2026-03-27)
- [ ] **Storage cleanup tool** — UI to browse/delete old image-jobs (2.5 GB of 3.4 GB total storage). (added 2026-03-10)
- [ ] **Drop `app_settings` table** — fully migrated to `workspaces.settings`, only 2 legacy fallback references left. (added 2026-03-12)
- [ ] **Clean up dead code in shopify.ts** — `getConversionsForTest()` is no longer imported anywhere. (added 2026-03-12)
- [ ] **Replace raw `<img>` with `next/Image`** — 4 locations: images/page.tsx, MorningBriefClient.tsx, ImportProgressPanel.tsx, ImageSwiper.tsx. (added 2026-03-12)
- [ ] **Lazy-load brainstorm tab content** — dynamic imports for HooksContent/LearningsContent to reduce brainstorm bundle. (added 2026-03-12)
- [ ] **Cron workspace iteration** — daily-snapshot still uses env vars for Meta. Low priority (shared Meta account). (added 2026-03-12)
- [ ] **Configure Doginwork workspace** — add products, set up Meta Ad Account when mom is ready. (added 2026-03-12)

## Tier 4 — Big Future Features
- [ ] **Animated Ads Pipeline** — Franky Shaw-style: brainstorm → NanoBananaPro images → Kling 3.0 transitions → ElevenLabs voiceover → Suno music. ~$9-10/ad. Design+plan ready. (added 2026-03-08)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas. (added 2026-03-10)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text. (added 2026-03-10)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements). (added 2026-03-10)
- [ ] **Auto-scheduling** — AI picks optimal publish time based on historical performance. (added 2025-02-25)

## Doginwork Valpakademin Quiz (live at quiz.doginwork.se/valpakademin)

Massiv overhaul-iteration v24→v64 över 3 dagar (2026-04-30 → 2026-05-02). Profile-card future-pacing-graf, offer-page hel rewrite (v19→v20), pricing reveal LP-style 1999→997, Pattern A/C placement, ?goto-dev-shortcut. Full audit i `doginwork/audit-2026-04-30-v58.md`. Quiz is launch-ready visually + structurally. Blocked on Marie-side fixes + IA-rewrite-decision.

### Session 2026-05-03 huvudwork
- [x] ~~**Offer-page IA-rewrite**~~ — Hero rewritten med "Vi rekommenderar Valpakademin för {name}" + personalization mirror, Marie founder flyttad upp innan name-drops, online-pill borttagen, icon-tiles redundans borttagen. Live. (done 2026-05-03)
- [x] ~~**Image webp pipeline**~~ — Sharp-baserad optimization auto-runs på publish via `optimize-quiz-assets.ts`. 6.63 MB sparat på 42 filer (avg -65%). Alla code-refs `.png/.jpg` → `.webp`. (done 2026-05-03)
- [x] ~~**Mobile keyboard CTA fix**~~ — VisualViewport-listener sätter `--quiz-keyboard-inset` så fixed-bottom-CTAs pushas ovanför iOS/Android-tangentbordet. (done 2026-05-03)
- [x] ~~**Landing-bild swap**~~ — French bulldog tennis-boll → golden retriever på cream-blanket (Higgsfield Nano Banana 2). 2.1MB → 63KB (-97%). (done 2026-05-03)
- [x] ~~**Reformulera b5 "Ignorerar?"**~~ — Bytt till "Hur ofta tittar {name} upp på dig under en promenad?" - neutralt, samma data. (done 2026-05-03)
- [x] ~~**Lägg till b16ba yes/no + b16c puppy-blues YES/NO branching**~~ — Liven-style naming-drop ("valpdepression") + 70% stat (ManyPets 2023). Conditional routing. (done 2026-05-03)
- [x] ~~**Ta bort dead-data frågor**~~ — b4, b7, b13, b14, b21, b10, b20 borttagna. Quiz från 31 → 24 steps. (done 2026-05-03)
- [x] ~~**Funnel Professor framework till quiz-knowledge**~~ — `09-funnel-professor-pillars.md` registrerad i index/README/FULL_KNOWLEDGE. (done 2026-05-03)
- [x] ~~**A/B test landing-slide**~~ — Variant A control vs Variant B "specific revelation" framing per FP. 50/50 split via variantGroupId. Live. (done 2026-05-03)

### NEXT UP (priority order efter session 2026-05-04)
- [ ] **Fix /api/quiz/session CORS** — `Access-Control-Allow-Origin: null` fel blockerar all per-step analytics från `quiz.doginwork.se`. Utan detta är A/B-testet flying blind. **HÖGSTA PRIO** - allt annat kvalitets-arbete på quizet är ovärderlig utan mätning. (added 2026-05-03)
- [ ] **Ad-to-quiz congruency audit** — Maries Meta-ads pitchar "Valpakademin" (kursen). Quiz lovar "personlig träningsplan". Plan ≠ kurs. Per FP är detta positioning #1. Antingen pivot ads → "diagnos"-framing ELLER pivot quiz → "kurs"-framing. (added 2026-05-03)
- [x] ~~**William mobile walk-through**~~ — Walkade 22 steg på 375x667 iPhone SE via Claude in Chrome + Playwright 2026-05-13. Hittade 4 issues: "plan"-ord baked-in (William: låt vara), sticky CTA hidden content (löste genom att ta bort sticky helt), 3000+-claim att verifiera (William: skit i det), grammar fix B11 (fixad). Cart-abandonment friction kartlagd (Klarna under-fold, marketing-checkbox pre-checked - William: kan inte påverka). End-to-end CTA → checkout verifierad funkar. (done 2026-05-13)
- [ ] **A/B-test deadline + utvärdering** — Sätt 1-2 vecks fönster eller ~500 sessions per variant. Sen evaluation. Förutsätter analytics fixed först. (added 2026-05-03)

### Session 2026-05-04 huvudwork
- [x] ~~**Profil + Offer split**~~ — Tillbaka till två separata sidor (b24 + boffer) efter merged-experiment. App.tsx detekterar isProfilStep/isOfferStep, .quiz-content-padding tas bort på båda för full-bleed hero/timer. (done 2026-05-04)
- [x] ~~**Sticky offer-timer i parent-DOM**~~ — Renderas via OfferTimerBar i App.tsx på offer-step only. sessionStorage-sync med inner offer-stack timer (samma key). Klampar till 00:00, ingen auto-reset. (done 2026-05-04)
- [x] ~~**Modal-overlay full viewport via iframe-expansion**~~ — bload commit-gate-modaler postMessar 'quiz-modal-open' → App.tsx adderar .modal-active → CSS gör iframe position:fixed inset:0 så iframens egna overlay täcker viewport. Iframes kan inte ha cross-iframe overlays utan denna trick. (done 2026-05-04)
- [x] ~~**Profile-card hero-fix**~~ — Cropade profile-hero.png 10% från top (oönskad whitespace mellan header och puppy-collage). Behöll bottom-whitespace för title-overlay. PawChamp-clone headline "Den sista träningsplanen [name] behöver" + "Vi förutser stora framsteg till [datum]" (dynamiskt today+28d). Chart med 5 X-axis-datum + Nu/Mål-pills som SVG-element. (done 2026-05-04)
- [x] ~~**Offer-page LP-ordning**~~ — Sektion-omflöde: Product intro → Vad du lär dig (4-fas) → Marie founder → Testimonials (before/after-bilder från LP) → 4 bonusar → 87% stat → Offer stack → Primary CTA → Garanti → Comparison → Urgency → FAQ. Borttagna: gamla 4-stegsmetoden, v20-mission, repeat CTA-pillar, sticky bottom-bar, runtime auto-Continue (inline .v20-cta postMessar). (done 2026-05-04)
- [x] ~~**Marie credentials-collage från LP**~~ — Bytte från cirkel-headshot till credentials-collage-bild (marie-credentials.webp - Marie i mitten med diplom + certifikat utspridda). Visuell trovärdighet utan att lista certifieringar i text. (done 2026-05-04)
- [x] ~~**Valpakademin produktbox från LP**~~ — Lade upp valpakademin-box.webp (svart kursbox + golden retriever + Doginwork-logo på gul cirkel-bakgrund) som product intro-bild. (done 2026-05-04)
- [x] ~~**Before/after testimonial-bilder**~~ — Williams färdiga before-after-1/2/3.webp uppladdade och swappade in i testimonial-cards. Headline ändrad från "Familjer precis som du" till "Före och efter Valpakademin". (done 2026-05-04)

### William-side blockers (uppdaterade 2026-05-02)
- [ ] **QUIZ2026 Shopify discount code (50% off)** — UPPDATERAD: William höjer base-pris från 997 → 1999 i Shopify, skapar QUIZ2026 = 50% off → 997 kr. Offer-pagen visar redan 1999 → 997. (updated 2026-05-02, was 10% off)
- [ ] **Activate `info@doginwork.com` mailbox** — Footer på offer-page länkar dit. Currently dead. (added 2026-04-30)
- [ ] **Real customer testimonial photos** — All 5 avatar-X.jpg är randomuser.me-stock. Behöver Maries OK för riktiga kund-foton. (added 2026-04-30)
- [ ] **Block 9 thumbnail-uppgrade** — 7 webp uppladdade 2026-05-01 men några matchar inte beteendet 100% (Skäller mycket = chihuahua, Hoppar på folk = springande hund). Antingen acceptera eller regenerera via nano-banana. (updated 2026-05-01)
- [ ] **Trustpilot setup** — Konto exists, inga reviews. Aktivera som final-step i kursen. (added 2026-04-30)
- [ ] **Marie installerar custom Shopify-app** — Behövs för unique-discount-codes-system (deferred till v2). Skippa för nu. (added 2026-05-01, LOW)

### Quiz-side optimizations (Claude can do, post-launch)
- [x] ~~**Slider-frågor (b10/b14/b21)**~~ — alla 3 borttagna 2026-05-03 (dead data + slider-fatigue). (done 2026-05-03)
- [ ] **End-to-end test på real iPhone Safari** — All UI har Playwright-simulerad 390px. Verifiera safe-area, sticky CTA-bar, font rendering på riktig enhet innan launch. (added 2026-04-30)
- [ ] **Did You Know-stat på loading-screen** — Per audit H1, ~5-8% CVR-lift för 30 min arbete. Lägg till "Visste du? 80%+ av kunder ser tydlig förändring inom 4 veckor*" på bload. (added 2026-05-01)
- [ ] **Variera CTA-text per step** — Nu är alla "Fortsätt". Per docs Pattern J ger "Få min plan"/"Visa min profil" osv ~1-3% lift. (added 2026-05-01)
- [ ] **Live calc interstitial efter b11** — "Bella kan {N}% av grundkommandon" - Woofz-stealable. (added 2026-05-01)
- [ ] **Plan-ID på profile + offer** — "Plan #VK-XXXX-2026" - Woofz case-file-känsla. (added 2026-05-01)
- [ ] **Unique discount codes v2** — Bulk-skapa via Shopify API, allocator-endpoint i Supabase, ~4h dev. Vänta tills CVR är validerad. (added 2026-05-01, LOW)

## Hydro13 iOS App
- [x] ~~**Automated TestFlight uploads**~~ — Nightly launchd job at 22:00, `scripts/upload-testflight.sh`, commit-based skip, auto build number increment. App Store Connect API key (Developer role). v1.1.0 build 4 uploaded. (done 2026-03-30)
- [ ] **App Store screenshots with AI** — Use [app-store-screenshots](https://github.com/ParthJadhav/app-store-screenshots) to generate professional ASO screenshots. Scaffolds a Next.js project, exports all 4 Apple sizes. Swedish locale. `npx skills add ParthJadhav/app-store-screenshots`. (added 2026-03-23)
- [ ] **Accessibility audit** — VoiceOver labels, Dynamic Type, contrast ratios. Common App Store rejection reason. (added 2026-03-30)
- [ ] **Widget verification** — Hydro13Widget target exists but unclear if fully wired up. Verify on device. (added 2026-03-30)
- [ ] **Android feature parity** — Android project exists but behind iOS. Catch up via Paperclip agents. (added 2026-03-30)

## Research System Follow-ups
- [ ] **Run seed data import** — `npx tsx scripts/import-research-seed.ts` to backfill existing VOC files into nuggets. (added 2026-03-25)
- [ ] **Wire research into blog-writer.ts** — Inject research context into blog article prompts. (added 2026-03-25)
- [ ] **Add more Trustpilot sources** — User will provide additional brands to monitor. (added 2026-03-25)
- [ ] **Monitor first automated scan** — Check results after 10:00 UTC tomorrow. (added 2026-03-25)

## Tier 1.5 — Immediate Follow-ups (new)
- [x] ~~**Hydro13 product appearance in static-ad-prompt**~~ — Extracted shared `product-appearance.ts`, wired into both `static-ad-prompt.ts` and `swipe-competitor.ts`. Commit `ab579ce`. (done 2026-04-04)
- [x] ~~**Push 104a340 to deploy**~~ — Already on `origin/main` (was stale entry). Confirmed deployed. (resolved 2026-04-04)

## Done (recent)
- [x] **Hydro13/Renew SEO dashboard + Shopify attribution** — Fixed empty "No GSC Properties" state, added per-workspace page filtering via is_primary flag + seo-workspace-filter.ts. Changed gsc_keywords unique index to drop workspace_id so workspaces share sync data. Verified sc-domain:get-renew.com in GSC. Shopify refactored workspace-aware (getShopifyCredsForWorkspace + per-store token cache). getOrdersByPage falls back to referring_site when UTMs stripped (attributes to article slug or __blog__). Added referrer meta to blog shell + /_headers to override CF default. Republished 50 articles across SV/DA/NO. Confirmed Renew order #1009 (Apr 15, 949 SEK) came from halsobladet.com. Commits `3fe8435` + `355f1b5`. (done 2026-04-21)
- [x] **Autopilot failure root cause: parallelize swipe image gen + bump cron timeout** - Investigated HappySleep failure streak (#146/151/152/154/157 all stuck or failed). Root cause: `swipeCompetitorAd` ran 3 image generations sequentially (30-90s each = 90-270s/concept) inside a cron with `maxDuration=300`. With 3 concepts/run + discovery + Claude Vision overhead, total exceeded 300s budget. Vercel killed crons mid-loop, leaving `source_images` partially populated and jobs stuck in `draft`. **Two fixes**: (1) Parallelized image generation in `swipe-competitor.ts` using `Promise.allSettled` (cuts 3-image gen from 90-270s to 30-90s). (2) Bumped `maxDuration` from 300 to 800 (Vercel fluid compute max). Both required - parallelization alone could still hit timeout on slow Kie runs, timeout bump alone wastes Vercel compute. Build verified clean. Also recovered stuck concepts: #156 to completed (17/18 translations done), #153/#157 to archived (unsalvageable, 2/3 images). Commit `8b33087`. (done 2026-04-07)
- [x] **Launchpad push root causes + /review bugs** — Six bugs fixed: (1) `finish-and-queue` bypassed `approveConceptAction` so markets/lifecycle never got created → pipeline-push couldn't find concepts, (2) `rejectConceptAction` only set `archived_at` not `status`, (3) `/review/pending` only excluded `draft` status instead of strict `eq("status","ready")`, (4) image count mismatch between /review thumbnails (3) and concept page, now shows all images with +N badge, (5) clicking Hydro13 concept in /review opened in HappySleep workspace → ReviewCard now sets `ch-workspace` cookie before navigating, (6) no recovery for stuck jobs → added `reconcileStuckJobs()` to pipeline-push cron (resets processing translations >2h, promotes stuck autopilot drafts >6h with images to ready, marks stuck processing jobs as completed when no pending translations remain). Also archived 4 broken HS stuck drafts (#146/151/152/154), manually approved 6 Hydro13 concepts (#12/14/15/16/17/18) onto launchpad (priorities -5 to 0), halved HappySleep DK budget from 1050 → 525 SEK/day. Commit `47e8a04`. (done 2026-04-07)
- [x] **cleanup-empty-adsets cron + throttling** — New daily cron at 07:15 UTC that queries Meta directly across every active campaign and pauses any ad set where every ad inside is paused (or empty). Source-of-truth zombie killer; catches what `auto-pause-bleeders` misses (legacy/manual ad sets, ad sets not in our DB). Added `effective_status` to `listAdSets`/`listAdsInAdSet`. Manually cleared 11 zombies in production. Added 250ms throttling between every list call + 500ms after writes to avoid Meta user request limit (subcode 2446079). Commits `6f595c7`, `1696ddb`. (done 2026-04-07)
- [x] **Bleeder cooldown + image retry + product appearance** — Bleeders now have 4-day cooldown. Swipe image generation retries 3x. "Importing" → "Generating..."/""Failed". Hydro13 white bottle description added. `productAppearance` always injected. `include_product_reference` logic fixed for native ads. 7 stuck concepts archived. Commit `104a340`. (done 2026-04-04)
- [x] **Blog UTM tracking for Shopify order attribution** — `injectBlogUTMs()` in blog-shell.ts tags all Shopify CTA links with `utm_campaign={slug}`. Applied at publish time + in Claude writer prompts. All 9 articles republished. Orders column on SEO Articles now functional. Commit `2caa42d`. (done 2026-04-02)
- [x] **Fix [LÄNK] placeholder + board filtering + Telegram webhook** — Three bugs fixed: (1) ad copy URL placeholders replaced with natural CTAs, (2) board dropdown filtered by workspace, (3) Telegram webhook re-registered. Autopilot board swipe verified working. Commit `cd6afc9`. (done 2026-03-31)
- [x] **CF Pages deploy bug fix + zombie cleanup** — Root cause: trailing `\n` in Vercel env vars broke manifest lookup. Added `.trim()` to `cloudflare-pages.ts`. Redeployed all 3 projects. Blocked blog pages from landing page selection. Killed 15 zombie ad sets. Added bleeder status (200+ SEK, 0 purchases = immediate kill). Reduced testing cooldown 7d→4d, max kills 5→10. Commit `7c4dd2f`. (done 2026-03-30)
- [x] **Mobile Review Page (`/review`)** — Cross-workspace mobile approval page. Shared `approval-actions.ts` (7 functions), refactored Telegram webhook + Hub approve endpoint. Filter tabs, 10s polling, deep linking via `?highlight=<id>`. Telegram notifications link to `/review`. Commits `3c31b8a`, `cebde95`. (done 2026-03-29)
- [x] **Workspace-aware language options** — Hydro13 shows only Swedish. WorkspaceProvider, useWorkspaceLanguages(), 22 files. Commit `907130c`. (done 2026-03-27, Paperclip CEO)
- [x] **Multi-workspace hardcoding audit** — 24 files fixed, removed all hardcoded HappySleep/pillow/collagen refs, pausedProducts filter, `|| "happysleep"` fallbacks. Commits `69dea06`, `f80afda`. (done 2026-03-27)
- [x] **Research Intelligence System** — Full Trustpilot scraping + Haiku evaluation + theme detection + brainstorm integration + UI. 7 Nordic collagen sources pre-configured for Hydro13. Commit `6d9e2f4`. (done 2026-03-25)
- [x] **Renew Meta + Shopify + Email infrastructure** — Full Meta setup (ad account, page, pixel, CAPI), Shopify custom app + Facebook & Instagram sales channel, SPF/DKIM/DMARC + Klaviyo branded sending domain. All via API. (done 2026-03-25)
- [x] **Move blog to SEO tab + content plan DB + SEO audit** — Blog under /seo with 5 tabs. `blog_content_plan` table. Autopilot reads from DB. GSC configured. 6 bug fixes. Commit `a44bbf4`. (done 2026-03-25)
- [x] **Blog mobile UX + WebP images** — Author byline with avatar, mobile table column hiding, WebP image optimization (97% size reduction). Republished all 4 articles. Commit `855ffcc`. (done 2026-03-25)
- [x] **7 autopilot pipeline improvements** — Auto-assign landing page, 12h quality gate, Telegram alerts, ROAS-based page recommender, angle diversity, GetHookd credit tracking, dynamic generation count. Commit `bc40e23`. (done 2026-03-23)
- [x] **One-Click Ad Pipeline** — Auto-generate images + auto-assign landing page on concept creation. Inline approve in brainstorm UI. 48h translation auto-approve. Activity Feed pending actions. Commit `6aa852f`. (done 2026-03-22)
