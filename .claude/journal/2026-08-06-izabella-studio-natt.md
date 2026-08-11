# Session: 2026-08-05 -> 2026-08-06 - Nischbeslut, bildswipe, Today-skärm och fyra live-buggar

Allt arbete i `/Users/williamhedin/Claude Code/izabella-v2/`. Ingen kod rörd i content-hub.
Live på `https://izabella-v2.pages.dev/studio`. Commit `e0aa997` på `main`, inte pushad.

## What was done

**Halva sessionen var strategi, inte kod.** William frågade om inredning var rätt nisch
för Izabellas konto. Jag läste hela Instagram-korpusen (98 källor) plus vår egen
studio-data och svarade: inredning finns inte i EN enda nischrankning i korpusen, våra
egna stora inredningskonton är reach-döda på reels, och köpsignalen är svag. Vi gick
igenom kost som alternativ, sen AI-nyheter, sen tillbaka till inredning när William
påpekade att enbildsformat kanske funkar där reels inte gör det. **Slutsats: inredning,
av rätt skäl - intresset är det enda bevisade, och verktyget är redan byggt för nischen.**
Kost ligger som spår två om trettio dagar inte ger räckvidd.

**Formatet blev DIP:s enbildsformat**, alltså en genererad still, ingen rörelse, inget
klipp. Enda formatet där kedjan går hela vägen från prompt till postbar fil.

**Bildswipe i stället för reelswipe.** William hade rätt och min invändning var
verktygsdriven: ett bildkonto lever på visuell form, och det är precis vad en reel inte
kan lära oss. Mätt först med en Apify-körning på 30 riktiga poster (8 cent):
**dolda likes är en egenskap hos KONTOT, inte hos posttypen.** Den gamla anteckningen
om att `apify/instagram-scraper` är oanvändbar var alltså fel.

**Nya verktyg och ändringar:**
- `tools/still-to-reel.py` (nytt): still till 9:16 mp4, statisk ruta, tyst, till bucketen
- `ingest.py --media image`: allmänna scrapern, Sidecar/Image/Video mappat till schemat
- `outlier_score` faller tillbaka plays -> likes -> kommentarer, bär `outlier_metric`
- `deconstruct.js` har två prompter, läge härlett ur payloaden, `BRANDS` för konto två
- Today-flik: spara fil, kopiera caption, markera postad. Landningsflik.
- Plan-flik: månadsgrid, "3 of 31 days covered"
- `iz_queue.source` (generated | her_own), `concept_id` nullable
- Reel-mp4 kan byggas i webbläsaren (canvas + MediaRecorder)

## Decisions made

- **Ingen Graph API-publicering just nu.** Verifierat att den funkar (professionellt
  konto + FB-sida, 100 posts/dygn), men API:et kommer inte åt Instagrams ljudbibliotek,
  så trendljud kräver appen. Insights-halvan har ingen sådan nackdel och är nästa steg.
- **Ingen TikTok/Shorts än.** Två av tre hinder från julibedömningen är borta
  (vattenstämplar, manuell dubbelpostning), men vi kör ett trettiodagars formattest och
  fler plattformar lägger variabler i just det testet.
- **Två köposter per koncept**, en reel och en bildpost, så mätlagret får jämföra.
- **Ingen zoom/Ken Burns på stillbilds-reels.** Williams beslut: "det förstör."
- **1K, inte 4K** på genererade bilder. Kie:s docs 403:ar, kostnaden för 4K okänd.
- **Manuell postning tills vidare**, därför Today-skärmen.

## Current state

Fungerar och verifierat live: inloggning, swipe med bilder, dekonstruktion i två lägen,
generering, kö, plan, Today. Commit e0aa997, deploy `studio-26-20260806` / `izabella-v2-80`.

Fyra buggar som var i produktion är fixade: `db()` kastade på varje `return=minimal`-
skrivning, magic link-redirect låg i bodyn, thumbnails använde hotlink-skyddade CDN-
länkar, och min egen Today-CSS staplade knappraden i hela appen.

`iz_results` är fortfarande TOM. Inget är postat.

## Blockers / Open questions

- 🔴 **Delningsarket är inte verifierat på riktig iPhone.** `navigator.canShare` är false
  i testmiljön. Hela Today-flödet hänger på det.
- **Nischmeningen för kontot** (topic + audience i en mening) är inte skriven.
- **Instagram Graph API standard access** - räcker den för hennes eget konto eller krävs
  app review? En halvtimmes utredning, inte gjord.
- `APIFY_TOKEN` i `content-hub/.env.local` är ogiltig (401). Den i memory fungerar.
- `home_inspo_` ligger avvisat på den gamla reels-regeln, bör scrapas om med `--media image`.

## Next up

1. Testa Save to camera roll på Izabellas telefon. Allt annat är sekundärt.
2. Skriv nischmeningen, sätt datum för första posten.
3. Insights via Graph API (läsning, inte publicering) - ger shares, saves, skip rate.
4. Spara en gissning per post om varför den ska funka, så den går att utvärdera.
5. Batchgenerering.

Fullständiga tankar: `izabella-v2/docs/IDEAS-2026-08-06.md`.
Teknisk handover: `izabella-v2/docs/STUDIO-HANDOVER.md`.
