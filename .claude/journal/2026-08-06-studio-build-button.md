# Session: 2026-08-06 (dag) - Build-knappen: hela kedjan bakom ett tryck

Allt arbete i `izabella-v2/`. Commit `121fe11`, deploy `af01f53b` / cache `izabella-v2-82`.
Live på `https://izabella-v2.pages.dev/studio`.

## What was done

William testade swipe-flödet på datorn, fastnade direkt ("sjukt förvirrande workflow")
och gav carte blanche att göra om UX:en helt. Ombyggnaden:

- **"Build a post" på varje Swipe-kort** kör hela kedjan själv: swipe (idempotent) →
  dekonstruktion → koncept + båda köraderna → 9:16-still (shot 1, 18 credits) →
  reel-mp4 byggd i webbläsaren och uppladdad till bucketen via nya `functions/api/upload.js`.
  Stegvisning på kortet, state.builds överlever tabbyten, retry återupptar från felsteget.
  Enda kvarvarande beslutet: datumet, förifyllt med nästa lediga dag ("Put it in the plan").
- **Flikarna 6 → 5.** Queue ihopslagen med Plan (kalender + Waiting for a day / Scheduled /
  Posted-details med insights). Osbyggda swipes bor på Swipe som "Saved for later" med
  Build-knapp; listkort bär saved/built-badges och "Build again" för varianter.
  Make omdöpt i funktion till manuella vägen.
- **Verifierat end-to-end på riktigt:** loggade in på prod via admin/generate_link
  (redirect_to ska ligga på TOPPNIVÅ i bodyn, inte i options - annars SITE_URL-fällan),
  körde Build på Williams egen vedrankustura-swipe. Riktig Gemini-analys, riktig still i
  bucketen, riktig reel-fil: **mätt 6,13s 1080x1920**. Båda köraderna i Plan med
  video/bild-preview. Odaterade - datum för första posten är Williams beslut.

## Bugg hittad av det riktiga testet (harnessen kunde inte se den)

🔴 `iz_concepts.assets` har DEFAULT `'[]'::jsonb` - en ARRAY. `.stills` satt på en array
försvinner i `JSON.stringify`, så assets-patchen skrev tyst tillbaka `[]` medan
`image_model` i samma patch landade. UI:t visade allt, DB:n var tom. Fix: normalisering i
`attachAssetTo()` + harness-fixturen ger numera array-formen med flit. Williams testbygge
lagades i efterhand med de riktiga bucket-URL:erna.

## Decisions made

- Jag schemalade INTE testbygget - första postens datum är uttryckligen Williams.
- Reel-steget är best effort: fallerar browserbygget blir det en note, Today bygger vid
  postning som förut.
- Still-lägets "4:5" i prompttexten byts till "9:16" vid Build (filen genereras 9:16).

## Blockers / Open questions

- 🔴 Delningsarket fortfarande overifierat på riktig iPhone. Oförändrat blockerande.
- Nischmeningen och datum för första posten: Williams.
- William har inte sett nya flödet ännu - han var på lunch.

## Next up

1. William testar Build själv + delningsarket på Izabellas telefon.
2. Datum för första posten (två färdiga koncept ligger i Waiting for a day).
3. Graph API-insights (läsning), gissningsfält, batch - enligt IDEAS-2026-08-06.

## Eftermiddag/kväll - tre varv till på Williams feedback

1. **Tre takes + val** (7236f0c): Build genererar 3 varianter, människan väljer, valet bygger reelen. Copy caption på build- och Plan-kort.
2. **JSON-promptning** (7242059): hubbens image-swiper-recept porterat - still-dekonstruktionen returnerar strukturerad extraktion (scene/composition/subjects/hex/photo_quality), stringify:ad som prompt. Källans palett behålls (moody-omfärgningen var det som gav "mörka hålan").
3. **Make = verkstaden** (662e769, 53df1dc): feeden startar bara builds (tunn status), allt mänskligt bor på Make, läget härleds ur DB (cooking/pick/day) - reload förlorar inget. Collect attachar via conceptId. Carousel-fix: adapted frame extraherar COVER-sliden (hus-blev-vas-buggen). Reel-dedup vid bekräftat val.

Slutläge: deploy f4c313ce / cache izabella-v2-87. Williams tre byggda koncept ligger på Make som välj-kort.

## Sen kväll - konceptsidor, ren bild + image text, referensbild, Today borta (799c2c3)

- **Konceptsida per bygge** (hubbens mönster, Williams direktiv): Build öppnar en egen sida - originalet överst (lightbox-förstoring, carousel-slides i remsa), stegen live, tre takes i full storlek, valet, dagen. Make = rader som öppnar sidan; feedkortet = tunn status med dörr. state.page-routing.
- **Text bort ur genererade bilder**: extraktionen komponerar PLATS för raden men renderar den aldrig; "Copy image text" på konceptsidan + To post-korten - texten läggs i Instagram-appen (native typ, kan inte felstavas). Löser också "chrome era"→"steel & stone"-frågan: raden är vår omskrivna, bilden är ren.
- **Källbilden som nano-banana-referens** (image_input) + brand-blocket får inte längre måla om källor - svaret på "bilderna inte lika originalet". Nästa steg om det inte räcker: Claude i stället för Gemini för extraktionen.
- **Today-fliken borttagen** ("fucking värdelös" som tom home screen) - due-listan bor överst i Plan som "To post", Swipe är home. 4 flikar.
- Harness: id=eq-filter i read-stubben (sidan fick fel rad utan det), OBS harness.html måste cache-bustas i browsern (?cb=).
- Deploy cbc3a0b2 / cache izabella-v2-88.

## Kalibreringsvarven (kväll, forts): 8ac8dc2 + c655232 + 68fd098

- **"för likt originalet"**: referensbilden (image_input) gav samma rum med samma prylar - UT igen. Ny extraktionsregel: SAMMA FORMAT, ANNAT HEM - objekt som klass (aldrig deras igenkännbara pryl), måttstock "en följare av källkontot ska inte känna igen rummet". Verifierat med nytt prod-bygge: format och ljus rätt, annat kök. William: "ser bättre ut".
- Konceptsidans refresh token-guardad (två parallella refreshes dubblade korten).
- **1 take default** (William: 3 nästan identiska = illusion för 54 credits) + "One more take (18 credits)"-knapp på konceptsidan som kör om BARA genereringen mot sparade image_prompts[0]. Prosa+JSON-mix medvetet skippad (prosa = gamla kvalitetsnivån).
- Slutläge: deploy 28c90a3d / cache izabella-v2-91. Kvar öppet: delningsarket på riktig iPhone, nischmeningen, datum för första posten. Två byggda chrome era-koncept ligger på Make (det senaste med nya kalibreringen - Williams val).

## Natt: HEALTH-branden + autopiloten (3053e58)

William: "fixa en version av appen för hälsa/kost så vi kan testa helt automatiserat". Svar via AskUserQuestion: bygg utan konto först, engelska globalt, bred vinkel (skärps på datan).

- **brand-kolumn** på iz_competitors/iz_concepts/iz_queue (DDL via Management API, verifierad mot PostgREST). Studio: brand-växlare i tabbraden (streckad, localStorage), ALLA queries+writes brand-scopade (inkl separata kalendrar/nextFreeDay). BRANDS.health i deconstruct (bred, modest claims, no medical advice). score.py: BRAND_SYSTEMS med hälso-rubrik (still-vokabulären); ingest/vet/score --brand.
- **Discovery**: WebSearch → 13 seeds (comparecalories, caloriefixes, thefitnesschef_, nutritiontactics, m.fl.) → 115 poster scrapade → enrich → vet (8 avvisade: calories.tips >2M, jonosteedman 25/post...) → score (nutritiontactics 100% median 10; dieteticallyspeaking/macnutrition korrekt utdömda som persondrivna).
- **tools/autopilot.py**: coverage-mätning → kandidat (percentil×fit, ENDAST active - ovettade vägras by design) → deconstruct/generate via studions EGNA API-routes (requireUser accepterar service-rollen; build_still_prompt är en python-SPEGEL av studio.js - kommentar i båda om synk) → auto-approve enda taken → still-to-reel.py → schemalägger nästa lediga dag. --publish = stub tills IG-konto+Meta-token finns.
- **Skarpt slutprov utan mänskliga klick**: dieteticallyspeakings 34,6x-carousel (post-fit 9) → koncept "Exposing the nutritional reality behind 'diet' food packaging" → ren still (jordnötssmörburk vs sockerpyramid, ingen text) → reel i bucketen → båda ytorna schemalagda. Kedjan stannar vid scheduled tills kontot finns.
- Deploy 9d0c7cda / cache izabella-v2-93.

Kvar för helauto på riktigt: professionellt IG-konto + FB-sida + Meta-token (William), publish-steget i autopiloten, cron (schemaläggs när kontot finns).
