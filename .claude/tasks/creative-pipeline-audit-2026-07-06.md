# Creative Pipeline Audit - 2026-07-06

> **STATUS 2026-07-06 kväll: ALLT ÅTGÄRDAT.** P0 (commit b36a9dc1, egen-implementerat + 4-vinklars kodgranskning som fann 15 följdfel, alla fixade), P1+P2 (e0708a49, två parallella agenter), P3 (ac44a596, två parallella agenter). DB: unikt index på (workspace, concept_number) + pushing-claim-index på meta_campaigns skapade, happysleep-dubbletter renumrerade. Reconcile-cronen live var 30 min - första körningen läkte 2 strandade jobb + failade 4 döda genesis-drafts. Gotcha under deploy: Vercels webhook missade e0708a49 helt (tom commit krävdes för att trigga).

Fem parallella granskningar (koncept-generering, bildpipeline, translations, Launch Pad/Meta-push, status-maskin/UI) + DB-hygienkontroller mot prod. ~80 fynd, dedupliserade och prioriterade nedan. Fynd markerade [LIVE] är verifierade mot prod-data, inte bara kod.

Utlösare: dagens buggskörd (junk-headlines från strängsplitt, draft fast i "Generating...", döda landing page-referenser vid push, hook-konvergens, tysta 0-koncept-fel).

## Genomgående rotmönster (5 st)

1. **Placeholder-som-innehåll**: härledda strängar presenteras som genererat innehåll (headline var hook-splitt i månader; `visual_direction` är FORTFARANDE en mall-sträng som styr alla Genesis-bildbriefer; concept_name är hook-splitt).
2. **Tysta fel**: errors[] samlas och kastas (genesis-route), catch-block sväljer, insert-fel ignoreras, "ready" sätts innan arbetet gjorts.
3. **Status-maskin utan självläkning**: enda watchdog-cronen togs bort 2026-04-27 (commit 7e5dbedf tog pipeline-push ur vercel.json). Allt som fastnar förblir fastnat. [LIVE: 3 jobb i processing sedan april, 19 pending translations sedan maj, genesis-draft fast sedan 19 juni]
4. **Sen validering**: landing pages, bild-status, judge-verdict valideras först vid push (eller aldrig) istället för vid inmatning.
5. **Write-only-data**: judge:REJECT-taggen, lifecycle "queued"-stage, versions-tabellen vid edits - skrivs men läses aldrig av det som borde bry sig.

## P0 - Pengarisk (Meta-spend), fixa omedelbart

| # | Fynd | Fil | Fix |
|---|---|---|---|
| P0-1 | Re-push efter partiellt fel duplicerar adsets; failade pushens ads förblir ACTIVE = dubbel spend | meta-push.ts:771-782, 412-421 | Pausa skapade objekt i catch; re-push matchar status in (pushed,error) + dedupe mot meta_ads |
| P0-2 | Arkiverade koncept auto-pushas av cron (archive nollar inte launchpad_priority/lifecycle) | api/image-jobs/archive/route.ts:21-26, pipeline.ts:1816 | Archive rensar priority+lifecycle; getLaunchpadConcepts filtrerar archived_at IS NULL |
| P0-3 | Cron-videopush använder cookie-fallback-workspace = happysleeps ad-konto (vars ads ska vara AV) | meta-video-push.ts:329-333, 461 | Ta metaConfig/wsSettings som opts, skippa getWorkspace() när workspaceId ges |
| P0-4 | setMetaConfig är modul-global - konkurrent request kan byta kreds mitt i en push | meta.ts:8-13 | Per-call config eller AsyncLocalStorage |
| P0-5 | judge:REJECT skrivs men läses ALDRIG - REJECT-koncept kan nå Meta via launchpad/cron | genesis/generate/route.ts:45 (enda writer) | Blockera vid launchpad-add + cron; eller persist REJECTs med egen status |
| P0-6 | Double-push race (guard läser före skriv, ingen unik constraint) + stale-guard på created_at bryter add-to-existing | meta-push.ts:187-196, 178-185 | Unik partial index (workspace, job, language) WHERE status IN (pushing,pushed); updated_at i stale-check |
| P0-7 | "Push Now"-semantik inverterad: utan schedule-setting skapas adsets PAUSED (DB säger pushed, levererar aldrig); med setting schemaläggs "Now" till imorgon; schematid räknas i UTC inte svensk tid | push-to-meta/route.ts:20, meta-push.ts:241-255 | activateNow vinner när explicit; concept-push skickar den; Europe/Stockholm |
| P0-8 | Timeout-retry på icke-idempotenta Meta-POSTs = dubbla ads/adsets | retry.ts (abort=transient), meta.ts:33-50,82 | Retrya inte createAd/createAdSet på abort; verifiera existens före retry |
| P0-9 | Ignorerade insert-fel desyncar DB från Meta (otrackade adsets/ads dupliceras vid nästa push) | meta-push.ts:641-659, 509-537 | Checka insert-fel; skapa campaign-rad FÖRE Meta-objektet |

## P1 - Fastnade states och självläkning

| # | Fynd | Fil | Fix |
|---|---|---|---|
| P1-1 | [LIVE] Watchdog-cronen död sedan 27 april - enda server-side recovery | vercel.json (pipeline-push borttagen i 7e5dbedf) | Återinför reconcile (gärna slimmad egen cron) |
| P1-2 | REJECT/bildlösa drafts strandade för evigt + visas som "Generating..."; reconcile täcker inte genesis (source='hub') | genesis/generate:41,58; cron/pipeline-push:453-460 | Terminal status för REJECTs (t.ex. rejected); no-image-inserts får ready; bredda reconcile-filtret |
| P1-3 | "ready" sätts FÖRE rendering; total render-miss = "Ready" med 0 bilder, fel kastas | generate-static-images.ts:199-202, 344-355 | failed när generated===0; persistera generation_errors på jobbet |
| P1-4 | 4 routes maxDuration 180s < Kie-poll 280s = garanterade mid-render-kills (translate, re-roll, qa-image, edit-image) | kie.ts:7 + resp. route | Höj till 800 (Pro-plan) eller matcha maxPollMs |
| P1-5 | create-translations krockar med passthrough-rader (unik-index) = hela batchen 500:ar, sv-koncept kan ALDRIG översättas via knappen; auto-recovery loopar felet | create-translations/route.ts:147-153 | Dedupe mot befintliga rader (som autopilot-translations gör) |
| P1-6 | 9:16/retry flippar jobb till processing men bearbetning är browser-driven - stängd flik strandar för evigt [LIVE: 19 pending sedan maj] | generate-9x16:84, retry:78 | Server-side processing via after() eller reconcile-cron som draina pending |
| P1-7 | Cron auto-approve completar jobb på enbart copy-status - pushar med saknade bilder | cron/pipeline-push:146-151 | Kräv inga pending/processing image_translations |
| P1-8 | Pipeline-errors når aldrig UI (kvall-tvivlare-buggen) + persist-fel tysta | genesis/generate/route.ts:196, 56 | Fånga result.errors → emit warning-event |
| P1-9 | concept_number max+1 utan lås/unik index [LIVE: happysleep #6 x2, #18 x2] | 4 insert-vägar | Unik index (workspace, nummer) + retry, eller RPC |

## P2 - Datakorruption och sync

| # | Fynd | Fil | Fix |
|---|---|---|---|
| P2-1 | qa-image-sync saknar aspect_ratio-filter - skriver över färdiga 9:16 med 4:5-bild | qa-image/route.ts:79-87 | .eq("aspect_ratio","4:5") (som edit-image) |
| P2-2 | edit-image/qa-image/9:16-sibling uppdaterar translated_url utan versions-rad - versionshistorik ljuger, restore återuppstår fel bild | edit-image:103, qa-image:81, translate:228-239 | Skriv version + active_version_id i alla tre |
| P2-3 | Bildredigering lämnar syskon (andra språk, 9:16) tyst inaktuella - mixade gamla/nya kreativ pushas | edit-image/route.ts:102-118 | Flagga/pending:a syskon efter source-edit |
| P2-4 | Re-roll raderar gammal bild+translations FÖRE nya inserten; läcker translation-storagefiler | re-roll/route.ts:176-184, 325-333 | Insert först, delete sist; städa translation-mappar |
| P2-5 | source_language-fällan (default 'en'): brainstorm/approve, manuell POST (ingen PATCH-support), re-roll-passthrough, add-languages | brainstorm/approve:71-89, image-jobs/route.ts:110, autopilot-translations:822, add-languages:71 | Sätt/acceptera source_language i alla vägar; passthrough i re-roll och add-languages |
| P2-6 | Compact job-GET inner-joinar versions - tappar pending/failed/passthrough-rader; progress/stall-logik kör på trunkerad data | api/image-jobs/[id]/route.ts:23-33 | Left join, filtrera client-side |
| P2-7 | Landing page: priority-0-config valideras aldrig; väljaren visar opublicerade stubbar; launchpad-add checkar bara non-null [LIVE: 2 döda stubbar, 4 jobb drabbade idag] | landing-page-recommender:139-153, api/launchpad | Validera publicerade translations vid add/approve; recommender-config genom getPublishedPageIds; rensa stubbar |
| P2-8 | Primary-ratio hårdkodad "4:5" i passthrough + edit-sync, men DB-default target_ratios är ['1:1'] | generate-static-images:305, edit-image:105 | Härled target_ratios[0] |
| P2-9 | Job-DELETE raderar storage före ownership-check | api/image-jobs/[id]/route.ts:155-179 | Verifiera ägarskap först |

## P3 - Kvalitet, kostnad, UX (urval)

- **Judge**: pris-regex matchar "30 sek"/"10 kr(aftfulla)" = falska REJECTs (creative-judge.ts:61, lägg \b); "proven"/"skin" är svenska/danska ord i engelska-listan; rubric-degradering osynlig (tagga rubricRan); hooks/headlines judgas aldrig; ensureHookLanguage failar tyst till engelska.
- **Placeholder kvar**: visual_direction är mall-sträng men styr bildbriefer (static-ad-prompt.ts:107) - låt bot skriva den; headline-fallback återinför klipp-buggen tyst vid botfel - tagga istället.
- **Kostnad**: edit-image/qa-image/QA-rerolls loggar aldrig usage_logs (upp till 3x underräkning); poll utan feltolerans slänger betalda renders (kie.ts:87); generate-variations kan överskrida 800s sekventiellt.
- **Autopilot**: genererar alltid engelska (buildBrainstormSystemPrompt 12:e arg saknas); mode-rotation död kod (jämför fel värdemängder) - alltid from_scratch.
- **UI**: failed-branch saknas i computeConceptStatus (detalj visar "Draft" när listan visar "Failed"); ingen Failed-flik; en misslyckad translation = hela jobbet "Failed" utan del-info; ElapsedTimer räknar från mount (döljer fastnade); "~321s per image" mäter kö-tid, cappad+cross-workspace; ETA antar concurrency 10, faktisk är 3; preview-modalen onåbar (setPreviewImage kallas aldrig); tags osynliga i alla listor (REJECT ser ut som PASS); affordance-asymmetri mellan de två bildgriddarna (QA-sköld bara i ready-grid); "Ready" betyder olika saker i lista vs detalj; ImageJobCard+ConceptBoard är död kod; "archived" saknas i status-unionen.
- **Launch Pad**: add validerar inte bild-status (failade jobb visar "Ready to push"); approve inserar överst medan manuell add lägger underst; priority-queries inte workspace-scopade; /queue-routen skriver lifecycle-rader inget läser (och blockerar senare launchpad-entry).
- **Övrigt**: max_tokens-truncation odetekterad (finish_reason ignoreras); ingen fetch-timeout i genesis.ts (en hängd call stallar den globala kön); client-disconnect mid-stream = unhandled rejection; cash_dna.ad_source "competitor_swipe" bryter enum-kontraktet; genesis-images parsePrompts kan rendera bot-preamble som bild ($).

## Åtgärdade under audit-dagen (redan klara)

- Headline = hook-strängsplitt → riktiga headlines via headline-bot- + backfill av matrix-batchen (40797809)
- edit-image-feature med ratio/språk-medveten sync (cfd97a4e, 2c07e678)
- 4 doginwork-jobb ompekade från död LP-stubbe till quiz-sidan (#8, #9, #11, #17)
- 18 matrix-koncept draft→ready; 8 namn-kollisioner omdöpta; 5 hook-kollisioner raderade + 4 regenererade med hook-förbud
- Hook-konvergens-lärdom sparad i memory (banned-hooks-lista per batch)

## Rekommenderad fixordning

1. **P0 i ett svep** (Meta-pengarisk, ~1 dag): allt är kirurgiskt och testbart utan att röra pipelinens lyckliga väg.
2. **P1** (självläkning, ~1 dag): reconcile-cron tillbaka + status-fixar + create-translations-dedupe. Efteråt: engångs-städning av de [LIVE] fastnade raderna.
3. **P2** (sync-korrekthet): qa-image-filtret och source_language-vägarna först.
4. **P3** i mån av tid - judge-regexen och usage-loggningen har högst värde per rad.

Rådata från granskarna: se agent-transkript i sessionen 2026-07-06. DB-verifieringar gjorda mot prod via Management API (read-only).
