# Session: 2026-08-06 kväll → 2026-08-07 (maraton) - @thehealthgraph från plan till LIVE

Allt i `izabella-v2/`. **Startdokument nästa session: `izabella-v2/docs/HEALTH-HANDOVER.md`** (omskriven från grunden i kväll - läs den, inte detta).

## Slutläge

- **@thehealthgraph LIVE**: första posten publicerad 2026-08-07 via API (carousel, https://www.instagram.com/p/DbvrnZjji6U/), två till i kö (8-9 aug), cron bygger 07:30 + publicerar 11:00 dagligen. Helt självgående.
- **Formatresan under dagen** (Williams styrning i ~10 iterationer): stillbilder → deterministiskt textband → tillbaka till generator-text + visions-QA → **carousel-clickbait-formatet** (timeinvestors-klassen) → **studie-sourcing ersatte swipe** (PubMed = källpool, deconstruct behövs inte för health; interior orörd) → Williams Figma-mall (gult, Anton 100px, tweet-kort, swoosh-finger) synkad till `carousel_render.py`.
- **Meta-setup via Claude in Chrome**: ny app "thehealthgraph publisher" i egen business-portfölj (isolerad från Incensor), Instagram-login-tokenflöde (tester-roll-fällan: inbjudan accepteras BARA via webben, inte appen), token i `.env.health` + 1P Dropship, auto-refresh inbyggd. Standard access räcker - ingen app review (verifierat mot Metas docs).
- **Copyregler kodifierade** i `docs/HEADLINE-RULES.md` ur Great Leads/Sugarman/Copy Blocks(Genesis)/Hormozi: feta rubriker (led med claimet, aldrig "a study of N", läsnivå 10 år), slippery slide-slides (varje slide slutar i mikrospänning), vävda block, densitet, egen käll-slide, epiphany 7-9 som gate-skala.
- **Nattens audit**: 14 buggar fixade+deployade (4 kritiska för obevakad drift: dött median_fit-veto, okontrollerad kö-insert, made-före-spend, tyst-tomt-vid-nätverksfel), auth-hårdning DOKUMENTERAD men ogjord (AUDIT-2026-08-07.md), V2-idéer i STUDIO-V2-IDEAS.md.
- **Källbas-arbetet som sen övergavs för health**: pool 33→76 bildposter, discovery-2 (4 nya konton), carousel-exkludering - allt kvar och gäller fortfarande för INTERIOR-lanen.

## Lärdomar värda att minnas

- **Sample-before-batch** (nu även i memory): fyra hela veckoombyggen byggdes innan William satte stopp - formatändringar testas på 1-2 exempel först.
- Generatorn respekterar inte marginal-instruktioner (5/6 zonbrott, ritade fejk-UI när zonerna förklarades) → deterministisk rendering för allt textbärande, generering bara för foton.
- Helhetsläsningar är instabila (median_fit-vetot); per-post/per-claim-bedömning + hårda grindar vinner.
- Fat-headline-reglerna gjorde även GATEN ärligare (samma studie föll från 8/10 till 4/10 när förpackningen inte längre räknades).
- @TimeInvestors har 0 tweets på X - tweet-korten i hela nischen är mockups. Vi gör likadant, med äkta källor som differentiering.

## Nästa session (vaktlistan i handovern)

1. Insights-ingesten (viktigast - `iz_results` är tom, allt mät-tänk väntar på den)
2. Carousel-kort i studions Plan-flik
3. Auth-hårdningen ur auditen
4. X-korspostning när William vill
