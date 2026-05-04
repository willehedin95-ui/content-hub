# Session: 2026-05-04 — Doginwork quiz + offer page overhaul

**Längd:** Heldag-session (William iterativ feedback)
**Personer:** William
**Fokus:** Splittade Profil-sida från Offer-sida, byggde om hela offer-sidan enligt LP-ordning, fixade timer-synk

## Vad som gjordes

### Tidigare på dagen (samma session, separata trådar)
1. **Block 9 bilder fixade** — 4 av 7 testimonial-bilder var fel (chihuahua istf schäfer m.m.). Rotorsak: William uploadade nya WEBP direkt till Supabase 2026-04-30 men lät gamla PNG ligga kvar; webp-pipelinen `optimize-quiz-assets.ts` re-konverterade gamla PNG → fel WEBP. Fix: laddade upp nya PNG från `~/Downloads/dog quiz utmaningar bilder/`, körde om pipeline. Sparade learning till `memory/feedback_quiz_image_uploads.md`.
2. **Quiz polish** — tog bort punchline på Pattern A, designade om citat-cards till Spirit Dog-stil, flyttade Pattern C (1940-tal) till strax före loading, lade till inline-CTA på educational slides, fixade nested-scrolls i alla iframes (overflow:hidden + scrolling=no, förbättrad height-measurement med image-load handlers).
3. **Modal-overlay fix** — bload commit-gate-modaler dimade bara iframens area. Insikt: iframes kan ALDRIG ha content som visuellt escapar sin bounding box. Lösning: när modal aktiv via postMessage från iframe → App.tsx expanderar iframe till `position:fixed; inset:0` så iframens egna lokala overlay täcker viewport.

### Profil + Offer omstrukturering (huvudarbete)

**Början:** Mergeade Profil + Offer till EN sida (`html_profile_with_offer()`) med parent-DOM timer mellan. User valde sen att splittra tillbaka eftersom den merged-sidan blev rörig.

**Slutsteg — split tillbaka:**
- b24 = "Block 24 - Profil" (bara html_profile_card)
- boffer = "Offer page" (med `_offer_body_without_hero()`)
- Båda har `.profil-step`/`.offer-step` shell-klass för full-bleed iframe (padding:0)
- Timer renderas i parent-DOM endast på offer-step

### Profile-card iterationer
- **Hero-bild fixad** — cropade 10% från toppen av `profile-hero.png` (puppy-collage hade onödig cream-whitespace), behöll bottom-whitespace för title-overlay
- **Headline omskrivet** — från "Bellas träningsplan är klar" till PawChamp-clone: "Den sista träningsplanen Bella behöver" + "Vi förutser stora framsteg till **1 juni**" (dynamiskt datum, today+28d)
- **Chart redesign** — multi-point X-axis med faktiska datum (NU 4 MAJ, 11 MAJ, 18 MAJ, 25 MAJ, 1 JUN), Nu-pill orange under start-marker, Mål-pill grön över end-marker
- **Bakgrund chart-card** — bytte från gradient (white → cream) till solid white (gradient skapade hård kant)

### Offer-page omorganisering (LP-ordning)
**Slutlig sektion-ordning:**
1. Sticky timer-banner (parent-DOM)
2. Vi rekommenderar: **Valpakademin** (med produktbox-bild från LP)
3. Vad du lär dig (4-fas deep dive — TRYGG START / 4 GRUNDERNA / UTE I VÄRLDEN / FRAMTIDEN med konkreta bullets)
4. Marie Hedin (founder + credentials-collage från LP)
5. Före och efter Valpakademin (3 testimonials med Williams färdiga before/after-bilder)
6. 4 bonusar (egen sektion, 4 dedikerade bonus-cards)
7. 87% + 3000+ valpägare
8. DITT ERBJUDANDE (offer stack 9 176 kr → 997 kr)
9. **Starta Bellas kurs nu →** (primary CTA)
10. 30 dagars garanti
11. Hur ligger Valpakademin till? (comparison: 12k/3.5k/997 kr)
12. Varför just nu? (urgency, vetenskaps-anchorad)
13. FAQ
14. Footer

**Borttaget:** v20-mission ("1940-tal")-blocket (redundant med Pattern C i quizet), gamla 4-stegsmetoden-sektionen (mergeade in i Vad du lär dig), repeat CTA-pillar #1 + #2, sticky bottom-bar.

### Visual cleanup-pass
- Headline format `<br />` mellan "träningsplanen" och "Bella behöver" (alltid 2-radig)
- All horizontal padding standardiserad till 16pt (ändrade `.fp-section` 4px→16px och `.v20-section` 20px→16px)
- "Vad du lär dig" — produktbild + outer vit card borttagna, 4 phase-cards är vita på cream-bg (omvänd kontrast)

### Timer-synk
- Sticky timer + inner offer-stack timer använde olika sessionStorage-keys → showed olika värden
- Synkade till samma key (`quiz-offer-timer-end`)
- Tog bort auto-reset-logiken från inner timer (matchar sticky som klampar till 0)

### CTA wiring
- `.v20-cta`, `.v20-cta-pill` knappar lyssnar på click och postMessar `quiz-runtime-continue` → exit step (Shopify checkout med QUIZ2026)
- Runtime auto-Continue dold på offer-step via `display:none` (inline knappar driver flödet)

## Beslut

1. **Profil + Offer separerade** istället för merged. User ångrade den merged-versionen — split-versionen läser cleanare.
2. **Marie EFTER "Vad du lär dig"** istället för före (user explicit val: "hör ihop med introduktion av kursen")
3. **87% precis före offer-stack** (social proof anchor direkt innan pris)
4. **Comparison mellan garanti och urgency** (svar på "är 997 mycket?"-frågan blir aktuell efter pris)
5. **Inga fabricerade siffror** — comparison-numren från Maries egen LP-text (privatlektion 1.5-2.5k×5-8 = 10-15k, valpkurs 2.5-4k för 6v). Dokumenterat i HTML-comments.
6. **Timer beteende:** Klampar till 00:00, ingen auto-reset. Matchar Maries no-fake-urgency-ton.

## Nuläge

- ✅ Profil-sida live, ren single-iframe med edge-to-edge hero
- ✅ Offer-sida live med ny LP-ordnad sektionssekvens
- ✅ Båda timers synkade
- ✅ Build passerar (npm run build)
- ✅ Commit pushat lokalt (inte till origin — auto-deploy stoppad)

**Live URLs:**
- Profil: https://quiz.doginwork.se/valpakademin?goto=Profil
- Offer: https://quiz.doginwork.se/valpakademin?goto=Offer+page

## Blockers / Öppna frågor

- **Sektion-densitet** — User initially flaggade att merged-versionen var "rörig". Splitten löste det men offer-page är fortfarande 14 sektioner. Riskerar fortfarande "vibecoded SaaS-template"-känsla om varje sektion har olika visuell stil.
- **CTA-strategi inom offer-body** — bara EN inline CTA just nu (efter 997 kr). User tog bort sticky-button. Funkar troligen — men oklart om man missar konvertering om scrollare avbryter innan dem når den enda CTA.

## Härnäst

Per Williams iterativa stil, sannolikt:
1. Visuell rensning per sektion (mer whitespace, färre olika kort-stilar)
2. Eventuell content-trim (sektion-densitet)
3. Verifiera offer-flödet end-to-end live (klick → checkout → exit_id med rätt rabatt)

## Tekniska anteckningar

**Filer ändrade:**
- `content-hub/runtime/quiz-runtime/src/App.tsx` — isProfilStep/isOfferStep + OfferTimerBar render
- `content-hub/runtime/quiz-runtime/src/renderer.tsx` — OfferTimerBar export, modal expansion CSS, profil-step/offer-step CSS
- `doginwork/scripts/build-quiz.py` — `_offer_body_without_hero()` strip-marker, b24/boffer flow split
- `doginwork/scripts/offer_html_body.py` — full body restructure, nya sektioner (bonuses, urgency), borttagna sektioner (mission, repeat CTAs)

**Nya Supabase storage-uploads:**
- `marie-credentials.webp` (Maries diplom-collage från LP)
- `valpakademin-box.webp` (LP:s produktbox)
- `before-after-1/2/3.webp` (Williams färdiga testimonial-bilder)
- `profile-hero.webp` (cropad version, top-only)
