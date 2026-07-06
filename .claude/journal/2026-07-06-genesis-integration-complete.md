# Session: 2026-06-18 → 2026-07-06 (Genesis-integrationen: Copy Coders tränade bottar i hubben - KOMPLETT + LIVE)

Lång flerdagars-session. Slutläge: hela Genesis-integrationen live i prod (`46d1fefc`), testad av William på både hydro13 och valpakademin.

## VIKTIGAST FÖR NÄSTA SESSION (Williams uttalade plan, i ordning)

1. **Uppdatera Christine-avataren med quiz-resultaten.** `quiz_sessions` har **2 353 sessions** (+ `quiz_events` med svaren) från quiz.doginwork.se/valpakademin = perfekt research. Uppdatera `doginwork/docs/01-avatar.md` med vad quiz-svaren visar (verkliga problemfördelningar, demografi, formuleringar). LÄS `doginwork/CLAUDE.md` + SESSION-LOG först (hard rules: inre psykologisk smärta ej socialt drama; bygg på dokumenten).
2. **Skriv om valpakademins `product_segments`** utifrån uppdaterade avataren. William tycker inte dagens beskrivningar känns representativa (de skapades 2026-05-03 ur comment-scrapen - grundade i riktiga citat men skrivna som telegrafiska maskin-kluster). Grunda i 01-avatar.md, inga påhitt.
3. **Välj vilka segment som ska användas som vinklar i ads** - sen börja generera skarpa Genesis-koncept mot dem.

## Vad som byggdes (Genesis-integrationen, allt live)

**Grunden:** William fick API-access till Copy Coders Genesis (146 tränade bottar, `gas.copycoders.ai/api/v1`) + Exodus. Reverse-engineerade hela systemet från workshop-transcripten (`Vault/raw/videos/*cc-workshop*`). Dokumentation: `docs/plans/exodus-genesis-MASTER-PLAN.md`, `genesis-bot-roster.md` (alla 146), `exodus-genesis-reverse-engineering.md`.

**API-kontraktet:** OpenAI-kompatibelt, `model`=bot-slug, `system` droppas (bot-prompt server-side), 1 concurrent stream/nyckel, 60 req/min. Körs på OpenRouter-nyckel (`GENESIS_PROVIDER_KEY` i .env.local + Vercel prod). Lokala `ANTHROPIC_API_KEY` är OGILTIG (roterad) - OpenRouter tar över överallt i Genesis-subsystemet.

**Koncept-generering (`/genesis` i sidomenyn):**
- `src/lib/genesis.ts` (klient, kö för 1-concurrent), `genesis-concepts.ts` (buyer→hooks→body byggblock + swipe), `genesis-pipeline.ts` (generera→döma→regenerera, streamas), `creative-judge.ts` (deterministiska hårdregler + LLM-rubric via OpenRouter haiku; REJECT ENDAST på engelska-i-svenska; grammatik/slop = WARN), `openrouter.ts` (chat+vision).
- NDJSON-streaming: koncept dyker upp ett i taget med fas-etikett. Segment-dropdown (från `product_segments`), språkväljare, awareness-hjälptexter ("Problem Aware (börja här)"), Auto-angle ROTERAR Problem-Agitate/Story/Root Cause/Curiosity/Contrarian (var tidigare tyst hårdkodad till Problem-Agitate - fixat 46d1fefc). "Luckor att sikta på" gömd tills ≥15 koncept.
- Koncept persisteras till `image_jobs` (samma kontrakt som brainstorm/approve) med `source_language` satt → **same-language passthrough**: sv-koncept får färdiga sv-translation-rader automatiskt vid rendering = NOLL Translate-klick, Preview&Push funkar direkt. Translate-UI göms när enda målspråket = källspråket.

**Static ads med Genesis image-bots (koncept-sidan, ersätter gamla style-väljaren):**
- `genesis-images.ts` + `/api/image-jobs/[id]/genesis-static` + `GenesisStaticPanel.tsx`: sökbar lista med ~37 format-bottar (8 pipeline/utility-bottar EXKLUDERADE - de hallucinerar på rå copy, t.ex. unaware-static-image-ads-bot gav lyftrems-ads) + hubbens 8 EGNA styles (märkta EGEN, körs via native pipeline). REK-badge på 12 kurerade format. Thumbnail per format (genererade via `scripts/generate-format-thumbs.ts`, 44/45 - curiosity-bait content-filtreras alltid av KIE). S/M/L-storleksväljare (localStorage). Antal 1-5. Bot får RIKTIGA produktfakta + förbud mot påhitt (fixade "hallon och blåbär").
- Format-badge på varje bild i rutnätet (generation_style).
- **Manuell QA-knapp (sköld-ikon) per bild**: vision-QA (gemini-2.5-flash via OpenRouter) kollar svensk text/produkt/PSA-skräp; text-only-fel → Nano-Banana text-korrigering in place (uppdaterar även sv-passthrough-raden). Auto-QA är AV (Williams val - full fart, QA on demand). Lib: `image-quality.ts`, endpoint `/api/image-jobs/[id]/qa-image`.
- Pre-render prompt-lint (`prompt-lint.ts`) inkopplad i `generate-static-images.ts`: auto-fixar amber/shot-glass/dashes för hydro13, flaggar engelska.

**Kringfixar:**
- Landing page-väljaren: thumbnails för ALLA sidor (99 backfillade via `scripts/backfill-page-thumbnails.ts`; `page-screenshot.ts` renderar HTML direkt för opublicerade + animation-freeze/timeout-race - puppeteer HÄNGER annars på Shopify-sidor). Shopify-sidan `doginwork.se/pages/valpakademin` registrerad som extern sida (stub + published_url-mönstret, page-id `73a822a3`). Tomma angle-flikar (snoring/neck_pain = HappySleep-hårdkodade) göms.
- `affiliate-sync` + `gsc-index-check` crons borttagna helt (`a616752b`), läs-sidan behållen (resolveAffiliateLink, listSitemaps, seo/index-stats).
- Genesis env-vars i Vercel prod (`GENESIS_API_KEY`, `GENESIS_BASE_URL`, `GENESIS_PROVIDER_KEY`) - lades via API; lokala .env.local var enda platsen först (klassisk funkar-lokalt-bugg).

## Gotchas (nya memory-filer/uppdateringar behövs ej - allt här + i `memory/genesis-integration.md`)
- Genesis-bottar är engelsk-tränade: hooks kan läcka engelska → `ensureHookLanguage`-säkring översätter (OpenRouter). Judge REJECT:ar engelska ord i svensk copy.
- Nano Banana: garblar å/ä/ö i bild-text (modell-begränsning, textkorrigerings-passet fixar); säkerhetssystemet skriver om "tunga" scener till PSA-text ("du är inte ensam") - QA:n failar sånt numera.
- puppeteer `page.screenshot` kan hänga för evigt på sidor med animationer - alltid freeze + timeout-race (page-screenshot.ts), eller Chrome CLI `--headless --screenshot` som fallback.
- Vercel deploys pollas via `api.vercel.com/v6/deployments?app=content-hub` med VERCEL_TOKEN ur .env.local.

## Kvarvarande idéer (ej byggda, Williams input finns)
- 9:16-transformern (unaware-static-image-ads-bot) för smarta story-versioner istf beskärning.
- "Föreslå format"-knapp (universal-static-bot analyserar copy → rekommenderar 3-5 format).
- Performance-loop (Genesis-koncept → Meta-resultat → lär vilka format/vinklar konverterar) - väntar på att skarpa koncept körts på Meta.
- Standing-rules UI (läs-pathen finns: `workspaces.settings.generation_rules` → prompten).
- Meta ads för doginwork: template-adsets/campaign-mappings troligen INTE konfade i Settings än (från förra sessionen).
