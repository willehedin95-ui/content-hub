# Session: 2026-08-08 - Studio V2, städning och story-formatet

Allt i `izabella-v2/`. **Startdokument nästa session: `izabella-v2/docs/HEALTH-HANDOVER.md`** - den är uppdaterad med hela story-specen och städningen. Läs den, inte detta.

## Vad som gjordes

**Studio V2 (fem byggen, Williams beställning "ta studion till nästa nivå"):**
- Auth-härdning: `ALLOWED_EMAILS` + dedikerad `AUTOPILOT_TOKEN` i CF Pages env (service-rollen nekas nu som bearer), rate limit 40 gen/h via ny `iz_api_log`, UUID-guard på deconstruct. Smoke-testat mot prod.
- Review-gate: ny scout-cron 20:00 skriver manus (0 credits) till `iz_concepts.review_status='pending'`; William dömer i Plan-fliken (Godkänn/Skippa); bygget tar godkända först och auto-godkänner bara när täckningen kräver det.
- Facit-flik i studion: PCR med heyDominiks band, per-post-facit, A/B-armarna.
- Veckorapport måndagar 08:00 → `izabella-v2/reports/`.
- Plan-korten renderar carouseller som slide-remsor.

**Städning (Williams fråga "har du rensat allt gammalt skit"):** 72 skippade körader + 54 swipe-era-koncept + 88 bucket-filer raderade. `autopilot.py` 773 → 336 rader (band-renderaren och swipe-bygget bort). Interior orört.

**Story-formatet (fjärde ytan, byggd och godkänd):** berättarröst + ord-för-ord-captions över kedjad bakgrund + genererad musik. Verktyg: `story_reel.py`, `story_bg.py`. ~3 credits/video.

## Beslut

- **Bara reels tills vidare.** Facit: carousellen nådde 0, reelen 103. Slides byggs ändå (källa till claim-kort och caption).
- **Story-formatets låsta val:** röst Alexey, captions `single` 224px mittankrade med studs, bakgrund `marble`, flytande manus, ETT accentord per mening.
- **Musik genereras** (`sonilo_music`) i stället för att hämtas från gratisbibliotek - unik per video = inget fingeravtryck i Metas ljuddatabas.
- **Kör lokalt, inte i Higgsfields sandlåda** - den återvanns tre gånger mitt i bygget. `mlx_whisper` fanns redan installerat.
- **Nischen låses INTE nu.** William: "vi kan inte bestämma hela kontots framtid efter en enda jävla post." Planens 30-dagarsregel gäller. Renew-kopplingen är avförd - kontot är fristående.

## Buggar hittade och fixade

1. **ffmpeg saknades i cronens PATH** - varje reel-dag föll tyst tillbaka till carousel. A/B-testet hade aldrig gett data.
2. **Whisper hallucinerade** ("a tower-lighted Timon Pocky's bubby") - captions tog orden från transkriberingen i stället för manuset. Nu är whisper bara klocka.
3. **Ämnesdubbletter** - dedupen kollade bara PMID, scouten skrev ultraprocessad mat två gånger.
4. **`qa_concept` kraschade hela scouten** vid Kie-timeout i stället för att hoppa över kandidaten.
5. **Reels stödjer inte `follows`-metriken** - första reelens mätning failade helt.
6. **libass renderar 0,61x av PIL:s mätning** - captions hamnade på 30% av bildbredden.
7. **Markdown-asterisker läckte till Instagram-captions**.

## Nuläge

Kontot har 2 poster (carousel 08-07 reach 0, reel 08-08 reach 103, 210 views, 87% completion, 0 shares/saves/follows). Kön: 08-09 och 08-10, båda reels med claim-kort och källrad. Cron: 07:30 bygg, 11:00 publicera, 20:00 scout, 21:30 mät, må 08:00 rapport. Saldo Higgsfield ~890 credits.

## Öppet

- **Story-lanen är inte automatiserbar än:** manusen skrivs för hand och röstgenereringen kräver Higgsfield-MCP:n (inte maskinanropbar från cron). Kie har API-nyckel i pipelinen - undersök som TTS-väg.
- **Innehållets jobb är odefinierat.** 87% completion men 0 delningar = håller uppmärksamhet, ger ingen anledning att agera. Förslaget (ej beslutat): fråge-formade pillars + en konkret sak att göra i varje post.
- **Sökfrågorna gör lanes mindre distinkta** än planen tänkte - kaffe hamnar i P2, koffein+sömn i P4, alkohol+sömn i P6. Försvårar pruningen dag 30.
- Sand-kategorin har bara 1 klipp (ink och marble har 5 var).

## Nästa

1. Låt det rulla. Första meningsfulla datan finns om ~1 vecka, pruning dag 30.
2. Spot-checka veckans poster (planens §10 - autopiloten godkänner sina egna takes).
3. Vid intresse: story-lanen automatiserbar (TTS-väg + story-läge i scriptwritern).
