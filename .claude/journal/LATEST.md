# Session: 2026-07-07 - HUB-AUDIT DEL 2: resten av hubben auditerad + ~155 fynd åtgärdade + deployat

Fortsättning på gårdagens creative-pipeline-audit. Idag: allt ANNAT i hubben - auditerat, åtgärdat, granskat, deployat, prod-städat. Prod på `7a6c941b`.

## What was done

### Fas 1: Audit (6 parallella granskningsagenter)
~130 fynd över: landing pages/publicering, SEO-bloggen, quiz-byggare+runtime, Meta-FÖRVALTNINGEN (post-push), tvärgående infra, verktygen. Dokument: `.claude/tasks/hub-audit-2026-07-07.md` (nu med slutstatus). Största: (1) alla ad-guards/sync avstängda sedan 27 apr medan Renew+doginwork spenderar, pengaknappar armerade mot apriltdata utan runWithMetaConfig; (2) tre öppna endpoints (process-swipe-queue helt utan auth = betald Kie-spend, pixel/stats läckte revenue, Fillout-webhook overifierad); (3) quiz: promoteVariant förstörde grafen garanterat + publish utan validering + analytics trunkerad till 1000 rader; (4) blogg: orphan-resume skulle mass-republicera 32 nedplockade artiklar vid återaktivering; (5) sitemap-förorening live (workspace-blinda queries); (6) demographics läckte in i bot-promptar via iterations-vägen.

### Fas 2: Åtgärd (Williams "kör")
- **Våg 1** (`c5062d58`, 102 filer): 5 parallella fix-agenter (Meta-avväpning, quiz, blogg-preflight, LP/publicering, verktyg) + eget säkerhets-svep (middleware boundary-match, cron-auth, x-import-token, demographics-strykning) + DB/DDL (unika index pages(workspace_id,slug) + mappings(workspace_id,product,country,format), kolumner ad_account_id + published_at, stubbar/ab_tests/zombie-rader städade).
- **Granskningspass**: 3 adversariella granskare på hela diffen → ~25 verifierade följdfel (bl.a. reject-iteration som arkiverade LIVE-koncept, autosave som dog permanent efter publish pga jsonb-nyckelordning, gate som skulle parkera VARJE doginwork-artikel, auto-pause utan baseline/staleness) → alla åtgärdade av respektive agent. Quiz+LP-agenterna dog på sessionslimiten nära mål; orkestratorn slutförde resterna själv.
- **KRITISK RÄDDNING**: quiz-agentens webhook-fix gate:ade på orders/paid - men doginwork-butiken prenumererar BARA på orders/create (verifierat i doginwork/output/SHOPIFY-CAPI-SETUP.md). Hade dödat köpspårningen. Rättat: båda topics accepteras, event_id-idempotensen (atomisk claim, INSERT+23505) deduplicerar.
- **Våg 2** (`7a6c941b`, 37 filer): trackedCronRoute-wrapper på alla 17 crons, dead-man-watchdog i reconcile, reconcile täcker nu translations.image_status/pages.importing/video_jobs, Telegram HTML + Resend-fallback för kritiska larm (sendCriticalAlertEmail, ALERT_EMAIL-env), AbortSignal-timeouts på alla externa fetchar, cron-status ompekad + stale-flaggor, Morning Brief staleness-banner.

### Fas 3: Efter-deploy-städning (allt verifierat)
- vercel.json: ad-performance-sync 06+18 + daily-snapshot 06:15 + zero-spend-alert 06:45 ÅTERAKTIVERADE (Renew/doginwork spenderar; bleeder-guards/autopilot förblir AV tills metrics flödar). **Blog-autopilot x4 + blog-images-retry BORTTAGNA ur schemat - WILLIAMS BESLUT: ingen auto-blogg får köra/spendera** (routes kvar för manuell trigger).
- Gamla globala mappings-constrainten droppad (krävdes för workspace-scopade upserts).
- Sömn-trion (somnbesvar, tips-for-att-somna, 1177-somnproblem) RADERAD från get-renew.com via Shopify API (fel butik, seed-läckans artefakter) - 404 verifierat. Halsobladet-kopiorna kvar (rätt domän för sömn-content).
- Halsobladet-sitemapen sanerad: 43 rena URL:er, inga valp-/kollagen-läckor, inga dubbletter. Sitemap+homepage+RSS omdeployade för sv/da/no med workspace-scopade koden. valptraning-skalet prunat ur manifestet.
- Livequizzet republicerat (graf-validering rent) - quiz.doginwork.se servar nya runtime-bundlen `BRZFnKYC` (session-retry, 50-chunkad event-flush, synkron buffer). Sessions flödar.
- Auth-röktester i prod: pixel/stats + cron-status → login-redirect, process-swipe-queue/morning-brief/bulk-import → 401, pixel-track + quiz-events fortsatt öppna.
- RESEARCH_IMPORT_TOKEN satt i Vercel (prod+preview) + .env.local.

## Decisions made
- **INGEN auto-blogg** (William explicit): autopilot + images-retry ur cron-schemat; alla preflight-fixar ligger kvar i koden om den någonsin ska på igen; analys-crons (gap/decay/sunset/low-rank) kvar men inerta (gate:ade på blog_autopilot_enabled=false).
- Metrics-sync + zero-spend-alert + daily-snapshot PÅ igen; bleeder-guards/autopilot-execute/cleanup väntar tills sync levererat färsk data (allt är ändå fail-closed på staleness nu).
- Shopify-webhooken accepterar BÅDA order-topics (butiken prenumererar bara på orders/create!) - idempotens via meta_capi_events.event_id är skyddet.
- 7-tecken + test-kollagen (hydro13, bara på halsobladet) lämnade live - bulk-republish till get-renew är egen framtida uppgift.
- Reject på fatigue-refresh (parent-jobb utan iteration_of) behåller konceptet, slänger bara bilderna; äkta iterations-barn arkiveras.

## Gotchas upptäckta
- **CF Pages SPA-fallback**: okända paths svarar 200 med homepage-HTML (ingen 404.html i deployerna) - det är därför "soft-404-skalen" fanns. Äkta 404:or kräver 404.html i deploy-flödena (backloggat).
- **cron_runs.status-constrainten** tillåter bara running/completed/error (inte "failed").
- **jsonb-nyckelordning**: Postgres sorterar om objektnycklar - jämför ALDRIG JSON.stringify(serverns jsonb) mot klientens stringify (autosave-buggen).
- **Watchdog-tabellen + cron-status-listan + vercel.json är TRE speglar** - uppdateras IHOP vid schemaändringar (kommenterat i filerna).
- Subagenter kan dö på sessionslimit mitt i fleråtgärdsarbete - inventera diffen med grep innan omdispatch; de hade gjort mer än väntat.

## Current state
- Prod på `7a6c941b`, tsc rent, 240/240 tester, build grönt. Alla ~155 fynd (audit + granskningsrundor) åtgärdade.
- Reconcile-cronen från igår frisk (0 kvar att läka); nu utökad med bildbatchar/imports/video_jobs + watchdog.
- Första ad-performance-sync-körningen sker 18:00 UTC idag (eller 06:00 imorgon) - först DÅ släpper staleness-spärrarna på pengaknapparna.

## Blockers / Williams actions
1. **Chrome-extensionen (FB-import) måste skicka `x-import-token`-headern** (värde: RESEARCH_IMPORT_TOKEN i .env.local) - annars 401 på bulk-import.
2. **Fillout-webhooken**: lägg custom header i Fillout-webhookens inställningar FÖRST, säg till → FILLOUT_WEBHOOK_SECRET sätts i Vercel (fel ordning = droppade ånger-forms).
3. **Events Manager**: kolla om doginwork-pixeln får Purchase från BÅDE webhooken och Shopifys egen kanal-pixel (olika event_id = dubbelräkning → Meta optimerar mot fel CPA).

## Next up
1. Verifiera första ad-performance-sync-körningen (cron_runs + meta_ad_performance får färska rader med ad_account_id) → staleness-bannern i Morning Brief försvinner.
2. Gårdagens kvarvarande: William sveper Genesis-matrisen (tagg matrix-2026-07-06) → statics → push.
3. 404.html i CF-deployflödena (äkta 404:or istället för SPA-fallback).
4. Ev. bleeder-guards på igen när metrics flödat några dagar (auto-pause är nu baseline+staleness+cap-skyddad).
