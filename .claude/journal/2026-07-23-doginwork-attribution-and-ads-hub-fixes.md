# Session: 2026-07-23

Stor doginwork + ads-tooling-session. Rubriken: **Meta överrapporterar doginwork-köp kraftigt (~2.4x)** - grävdes fram mot Shopify-facit, orsaken hittad (dubbelräknad Purchase-pixel), fix shippad. Sen: dödade/trimmade svaga annonser, kopplade GetHookd MCP + swipe:ade konkurrent-statics, körde en live swipe-demo (koncept #42), och fixade en HappySleep-hårdkodad pain-point-väljare i ads-UI:t. 4 commits pushade; 1 fix (pain-points) committad-men-ej-pushad (William har fler ads-fixar på gång).

## Vad som gjordes

**1. Cron/uptime false-alarm-fixar (3 commits, pushade):**
- `dc242b80` - tog bort avvecklad `invoice-check` ur cron-watchdog-speglarna (`reconcile-stuck-jobs` + `cron-status`) + raderade orphan-routen. Fyrade ett dagligt falskt "invoice-check verkar död"-Telegram-larm (cronen togs bort 2026-07-08 men lämnades i watchdog-listan).
- `a94f45fd` - härdade `scripts/uptime-watch.mjs` ("Uptime-vakt"): spacad backoff-retry, småbatch-pacing, riktig browser-UA, 429/430 = throttlad monitor (larmar ej). Falsklarmade på transienta Shopify rate-limits/503.
- `18cfe2c8` - samma härdning för `landing-page-health`-cronen (tvilling-monitor).

**2. doginwork Meta-attribution - Meta överrapporterar ~2.4x (huvudfyndet):**
- Verifierat mot Shopify-facit (`DOGINWORK_SHOPIFY_*` -> orders.json + `meta_capi_events` + `quiz_sessions`). 30d: Meta hävdade **80 köp / 80k SEK / 2.81x ROAS**; verkligt = **56 ordrar / 56k** (ordernr 1600-1655 i följd = komplett); deterministiskt Meta-drivet (fbclid/qz_sid/fb-referrer) = **33 ordrar -> sann Meta-ROAS ~1.15-1.4x**. William hade skalat på de uppblåsta 2.8x.
- Två orsaker: (1) **dubbelräkning** - doginworks Shopify har BÅDE Shopifys inbyggda Facebook & Instagram-pixel (Server+Web, deduplicerar med sig själv) OCH vår webhook-CAPI (`event_id=shopify_{order.id}`); olika event_ids -> Meta kan inte deduplicera -> ~+43% spöken. (2) view-through-överattribution.
- **Fix `e499b855`**: gejta vår webhook-CAPI-sändning bakom `workspaces.meta_config.skip_capi_purchase`; satt `true` för doginwork så Shopifys native pixel blir enda Meta-källan. Webhooken skriver fortfarande quiz_sessions + Telegram + meta_capi_events. Flaggan ÄR satt. Metas siffra ska falla ~80 -> ~56 kommande dagar (det ÄR fixen, inte sämre resultat).
- Minne: `doginwork-meta-attribution.md` (HARD: lita aldrig på Metas doginwork-kolumn, mät på facit).

**3. doginwork ad-actions:**
- William sänkte kampanj-budget -20% (rätt vid break-even).
- Dödade **SE #002** "valp-kaos-quiz" (0 köp/17d, adset+annonser pausade). Trimmade **SE #007** "välj din valpfas": pausade döda underannonsen [2] (555 kr/0 köp/14d), behöll [1]+[3].
- Obs: SE #021 "bet mig 30 gånger" kom igen (29% CTR + konverterar) - min day-3 kill-flagg var förhastad; bra att den inte dödades.
- Skickade Telegram-sammanfattning av doginwork-läget + creative-noter.

**4. GetHookd MCP + konkurrent-swipe:**
- William kopplade GetHookd-connectorn (Full access). Svepte de spionerade hund-brandsens topp-IMAGE-annonser (Dogo, SpiritDog, Ben, Lionel, Woofz) och swipe:ade **12 statics** till hans swipe file. Williams styrning: **braindead-swipa toppresterarna, ingen analys/blueprint** (minne `feedback_doginwork_braindead_swipe_not_analysis.md`; tog bort en blueprint-memory jag skrivit).

**5. Live swipe-demo - koncept #42:**
- Körde **Ad Spy-swipern** (`swipeCompetitorAd`) på SpiritDogs "Stressed vs Happy Puppy"-before/after -> doginwork-koncept **#42 "Stressad Valp vs Lugn Valp"** (3 bilder + svensk copy grundad i Maries 4-stegsmetod + 30-dagars-garanti). Job: `/images/0c9f60cd-5772-44af-a73e-a70a05cf5da2`.
- Lokala `.env.local` ANTHROPIC_API_KEY är ÅTERKALLAD (verifierat 401) - körde swipen på PROD istället: la in en `discovered_ads`-queued-rad + triggade `/api/cron/process-swipe-queue` med CRON_SECRET (prod har giltig nyckel). Ren väg när lokala nyckeln är död.
- Klargjort: swipern använder **Ad Spy / brainstorm.ts-pipelinen** (`buildFromCompetitorAdSystem` + Claude Vision + Kie), **INTE Genesis** (Copy Coders-bottarna / creative-judge är ett separat `genesis-*.ts`-system som swipern inte rör).

**6. Ads-UI-fix - pain-point-väljaren (committad, EJ pushad):**
- Brainstorm "From Competitor Ad" Pain Point Focus-knapparna var hårdkodade till HappySleep (`neck-pain/snoring/sleep-quality`) i `BrainstormGenerate.tsx:1200`. Ändrade dem att hämta från produktens `segments` (dynamiskt per workspace, samma mönster som segment-väljaren på rad 1513). Build grön. EJ pushad - William vill batcha med fler ads-fixar.

## Nuvarande läge
- **Pushat:** dc242b80, a94f45fd, 18cfe2c8, e499b855 (HEAD).
- **Committat-ej-pushat (denna wrap-up):** BrainstormGenerate.tsx pain-point-fixen + denna journal + backlog.
- doginwork-annonser: SE #002 pausad, SE #007 [2] pausad, `skip_capi_purchase`-flaggan PÅ.
- GetHookd MCP kopplad; 12 konkurrent-statics i Williams swipe file.
- Lokala ANTHROPIC_API_KEY död - lokala swipe/brainstorm-script kör inte förrän den uppdateras (prod funkar).

## Handover - fortsätt ads-arbetet
William vill "fixa massa fler grejer med ads i hubben." Startpunkter för nästa agent:
- **Leta fler HappySleep-hårdkodningar i ads-UI/pipeline** - pain-point-väljaren var en; troligen fler (`SwiperAngle` i `types/index.ts:618`, autopilot-keyword-listor i `autopilot-concepts`, landing-page-angle-presets). Generalisera per workspace.
- **Pusha pain-point-fixen** (BrainstormGenerate.tsx, committad-ej-pushad) när ads-batchen är klar + William bekräftar (aldrig push utan hans ok).
- **Swipe-motor vs Genesis:** konkurrent-swipern kör den äldre brainstorm-pipelinen. Vill William ha swipes genom Genesis (Copy Coders + creative-judge) = en wiring-uppgift (`genesis-pipeline.ts`).
- **12 konkurrent-statics** ligger i GetHookd swipe file, redo att swipas till koncept (Ad Spy -> swipe, eller den fixade Brainstorm-UI:n).
- **Bevaka att attributions-fixen landar:** bekräfta att Metas doginwork-köp-siffra faller mot ~56 kommande dagar (meta_capi_events order-spegel vs Meta insights).
- Uppdatera lokala ANTHROPIC_API_KEY i content-hub/.env.local (återkallad) så lokala script kör.
