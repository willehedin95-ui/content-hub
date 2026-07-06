# Session: 2026-07-06 (heldag/kväll) - Avatar ur quiz-data, Genesis-matris, bild-edit-feature, FULL PIPELINE-AUDIT + åtgärd av ~80 fynd

Mycket lång session i tre akter: doginwork-research → hub-features → total audit + fix av hela creative-pipelinen.

## What was done

### Akt 1: Doginwork avatar + segment (handoverns steg 1-3)
- **01-avatar.md uppdaterad med quiz-datan** (2 353 sessions ur `quiz_sessions`/`quiz_events`; svaren ligger i events med opaka option-ids, mappas via `quizzes.data.nodes`). Nyckelfynd: pain-fönstret är 0-6 mån (60% 0-3), problemet färskt (<1 mån för 59%), bitande #1 (23.5%) och skällande SIST (6.5%), 89% relationell framing, tvivel hos 1/3, ras = long-tail med blandras störst.
- **Williams tolkningsregler** (sparade i memory `feedback_doginwork_quiz_data_interpretation.md`): underlaget är ALLA svarande, inte de 20 köparna; tid-per-dag-svaret är självbild (~5 min verklig vilja); "proaktiv" var fel etikett - rätt läsning är TIDIGT I PROBLEMET (alla klickade en problem-ad).
- **`product_segments` omskrivna** (6 gamla maskin-kluster → prosa, 2 nya: "Tidigt i problemet" + "Rumsrenhet", 1 till efter bot-discovery: "Erfaren hundägare, nybörjare igen"). Quiz-stats i demographics-fältet (UI-only), INTE description (går rakt in i Genesis-bottar → läckagerisk).
- **Genesis segment-discovery** (Williams idé): 5 Copy Coders-bottar på hela research-korpusen. Huvudfynd: marknaden delar sig på PSYKOLOGISKT LÄGE (tidigt ~40% / tvivlare ~30% / erfaren-nybörjare ~18% / relationsskydd ~12%), inte problemtyp. Två ortogonala axlar: problem = hook, psykologi = ton. Syntes: `doginwork/docs/08-genesis-segment-discovery.md` + rådata i `docs/research/genesis-segment-discovery-2026-07-06/`. Enzymspray-lärdomen: insider-tips ur kundgruppen är expertis-content, INTE igenkännings-symboler för cold ads.
- **Exploration-matris genererad**: 17 koncept över 14 vinklar (5 problem x 2 toner + 4 fristående), tagg `matrix-2026-07-06`. Hook-kollisioner (4x samma öppningsrad) raderade + regenererade med explicit hook-förbudslista (`scripts/genesis-matrix-refill.ts`); lärdom i memory `genesis-integration.md`: bottarna konvergerar på starkaste citatet - skicka ALLTID banned-hooks vid batch.

### Akt 2: Hub-features (Williams feedback under swipen)
- **Headline-buggen**: `ad_copy_headline` var hookens första sats klippt på skiljetecken ("Klockan är 20:15" → "Klockan är 20"). Nu riktiga headlines via `headline-bot-` i både generate- och swipe-vägen + backfill av hela matrisen (`40797809`).
- **Bild-edit-feature**: penn-ikon på bildkort i BÅDA grid:arna → kommentar → Nano Banana regenererar samma bild in place, ratio/språk-medveten, synkar sv-passthrough (`cfd97a4e`, `2c07e678`). E2E-testad mot temp-kopia (vår→sommar i fönstret, allt annat identiskt).
- **Launch Pad-felet** "No published landing page for sv": 4 koncept pekade på död sida-stubbe → ompekade till quiz-sidan. Två döda "Valpakademin Sales Page"-stubbar kvar i pages (William ej svarat om rensning).

### Akt 3: FULL AUDIT + ÅTGÄRD (Williams "kör allt")
- **Audit**: 5 parallella granskningsagenter + DB-hygienkontroller → ~80 fynd, 5 rotmönster (placeholder-som-innehåll, tysta fel, ingen självläkning sedan watchdog-cronen togs bort 27 april, sen validering, write-only-data). Dokument: `.claude/tasks/creative-pipeline-audit-2026-07-06.md` (nu med slutstatus).
- **P0 pengarisker** (`b36a9dc1`): claim-first + unikt pushing-index, re-push-dedupe över alla kandidatrader, pausade adsets återaktiveras, activateNow-inversionen, Europe/Stockholm-schematid (DST-säker), 429-only mutations-retry, runWithMetaConfig (AsyncLocalStorage) på alla pengavägar, judge:REJECT/archived-gates vid approve+launchpad+push-chokepoint. 4-vinklars kodgranskning av MIN egen P0-diff fann 15 följdfel (bl.a. stale-expiry till fel status, video-schemat aldrig fixat, B-krasch fällde A-raden) - alla fixade före commit.
- **P1+P2** (`e0708a49`, två parallella agenter): ny `reconcile-stuck-jobs`-cron var 30 min (resets, server-side draining av browser-strandade translations, draft-promotion, genesis-draft-fail), ready-före-render fixad, pipeline-errors till UI, concept_number insert-retry på nytt unikt index, create-translations-dedupe (sv-koncept kunde ALDRIG översättas via knappen), qa-image 9:16-klobber, delad recordActiveVersion, stale-sibling-reset efter edit, re-roll insert-först, source_language på alla vägar, compact-GET left join, LP-validering vid launchpad-add.
- **P3** (`ac44a596`, två parallella agenter): judge-regexen ("somna på 30 sekunder"/"10 kraftfulla" REJECT:ar inte längre; proven/skin språk-scopade; rubricRan-suffix), riktig visual_direction via mariobot VISUAL:-rad, Kie usage-loggning (3x underräkning), poll-tolerans, genesis 120s-timeout, autopilot på workspace-språk + fungerande mode-rotation, launchpad-prioriteter workspace-scopade, död kod raderad (queue-route, ImageJobCard, ConceptBoard), UI: failed/rejected/archived-badges, Failed-flik, judge-piller, stalled-hints, ärliga ETA/snitt, preview-modal återkopplad, QA-sköld på processade bilder.
- **DB-åtgärder**: unikt index (workspace, concept_number) efter renumrering av happysleep-dubbletter; pushing-claim-index på meta_campaigns; 4 döda LP-pekare ompekade.
- **Prod-verifiering**: reconcile-körning #1 (7m41s) läkte 2 strandade jobb + failade 4 döda genesis-drafts (äldsta från 19 juni). Resterande 8 pending + 1 processing drainas på schema.

## Decisions made
- Quiz-procenten hålls UTANFÖR segment-descriptions (bot-input) - läckagerisk till annonscopy.
- REJECT-koncept persisteras med status "rejected" (terminal) istället för draft; gates på tag-prefix `judge:REJECT` i hela kedjan.
- Mutations mot Meta retryas ENDAST på 429 (okänt utfall vid timeout = dubblettrisk); idempotenta calls behåller transient-retry.
- Reconcile som EGEN slim cron - pipeline-push (auto-pushen) förblir avstängd.
- Unarchive är medvetet lossy (priorities/lifecycle återställs ej) - re-approve är vägen tillbaka.
- Archive/reject exitar BARA pre-push-lifecycle (launchpad/queued) - killed/live-historik röjs inte (annars dubbla learnings).

## Current state
- Prod på `ac44a596`, allt byggt + tsc-rent, alla 4 audit-faser deployade.
- Matrisen (17 koncept, distinkta hooks, riktiga headlines) redo för Williams swipe → statics → Meta-push (mapping finns: "Sales Valpakademin" + template-adset "#101 (Quiz)").
- Reconcile-cronen läker resterande fastnade rader automatiskt.
- Kvar i pages-tabellen: 2 döda "Valpakademin Sales Page"-stubbar (väntar på Williams ok att rensa; recommendern/launchpad validerar numera ändå).

## Blockers / Open questions
- **Vercel-webhooken missade en push helt** (e0708a49 - ingen build skapades; tom commit krävdes). Om sidfoten inte byter hash efter push: kolla Vercel-deployments FÖRST.
- Statics + Meta-push för matrisen väntar på Williams koncept-swipe.
- P3-idé ej byggd: campaign-builderns legacy createAdSet-flöde fick bara config-scoping, ej claim-first-mönstret (låg trafik, manuellt flöde).

## Next up
1. William sveper matrisen (tagg `matrix-2026-07-06`) → statics på överlevare (GenesisStaticPanel) → push. Läs resultaten per RAD/KOLUMN (ton vs problem).
2. Verifiera reconcile-cronens andra/tredje körning (cron_runs) - alla gamla pending ska vara borta inom ~2h.
3. Rensa de 2 döda page-stubbarna om William godkänner.
4. Genesis-idéer från backloggen (9:16-transformern, Föreslå format-knapp, performance-loop) när Meta-data börjar komma.
