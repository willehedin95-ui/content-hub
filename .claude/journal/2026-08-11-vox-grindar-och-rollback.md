# Session: 2026-08-10/11 - vox-lanen: kritiker, bilddomare, mätgrindar, rollback

Allt i `izabella-v2/`. Lång session som gick över midnatt. **Läs `izabella-v2/docs/HEALTH-HANDOVER.md` först**, sedan `tools/story_presets.py` (`vox`-presetens `lessons`).

Kön är **PAUSAD** sedan 2026-08-10 (`# PAUSAD` i crontab, backup i sessionens scratchpad). Ingenting publiceras.

**Återgångspunkt:** taggen `natt-utgangslage` (commit `e682c2f`). Allt efter den är enskilt återställbart.

## Vad som gjordes

**Kritiker på bildvalen (`study_pipeline.critique_beats`).** Ett separat modellanrop per video som får varje bild tillsammans med *meningen* den landar i och en enda fråga: gör bilden meningen tydligare, eller är den dekoration som råkar dela ett ord med den? Fångade alla sex fel William listade i video 3, oombedd (måne för "day", kudde för "softer", hjärna som filler, sockerbitar för en fyra-ordslista, folkmassa, måttband) plus att `gym` var fel betydelse av "work". Kör efter send-testet, före utkastgrinden.

**Bilddomare på props (`judge_prop` + `kie_vision`).** Granskar den *faktiska bilden*, inte beskrivningen. Ett svep över biblioteket underkände 11 av 58: en bar gravidmage ur beskrivningen "a person holding their full belly", **en hand med sex fingrar som låg i en färdig video**, grön pil inbakad i två bilder. Underkänd två gånger → slugen hamnar i `assets/vox-props/_rejected.json`, och `Props.ensure` raderar en cachad fil vars slug står där. Färg döms *inte* av den (William: "så jävla petiga behöver vi inte vara") - mättnad är ett tal och äger den frågan.

**Mätgrindar på den färdiga filen.** Dagens missar var alla mätbara och slank igenom för att grindarna bara mätte specen. Nu mäts täckningen var 0,25s: golv 6%, längsta tomma 1,5s, andel tomt 10% av manuset, medeltäckning minst 10%, plus bildruteantal och att rutorna faktiskt skiljer sig. Plus en egen grind på **första rutan** (miniatyren).

**Läkemedelsgrind.** Ett claim som nämner receptbelagd medicin avvisas, inklusive omskrivningar ("standard care"). Kravet på en jämförelse är borttaget - det släppte igenom "...in people taking INSULIN" vars manus sa "shrink your daily insulin dose".

**Modellgranskning av hela videon (`tools/vox_review.py`).** Egen kommando, ändrar ingenting. Ger modellen formatets förutsättningar först, och verifierar varje påstående mot en mätning. Första körningen: 5 påståenden, 1 höll (tom första ruta - riktigt och viktigt), 4 motbevisade ("den här bilden är en upprepning" × 4, specen hade noll dubbletter).

## Beslut, med skäl

**Trimning av beats mot pappersbyten är AV.** Mätt båda vägarna på samma manus: med trimning 4,8s dötid inom manuset, utan 2,6s. Den infördes för att en prop inte skulle ligga kvar när bakgrunden byts - men den observationen gjordes i en video där propen dessutom satt fast 22,8s av en annan bugg. `VOX_TRIM_SWITCH=1` går tillbaka.

**Bredderna räknas ur ytan, inte skalas rakt över.** Över captionbandet finns 1080×1344 = 1,45 Mpx; en prop är i snitt 1,2× så hög som bred, så tre kräver B ≤ 635. Skala 1,18 gav 668 → krocklösaren krympte 19 props i tre omgångar → täckningen kollapsade. Skalan gäller nu bara ett och två props.

**Beat-golvet är 20, prompten ber om 24-28.** Räknat: en bild var 1,6s över 40 sekunder = 25 beats. Mätt på tre studier: 24 beats → 1,5s dötid (godkänd), 20 → 2,2s (godkänd), 18 → 6,2s (underkänd). Den underkända faller nu även på beat-golvet i fas 1, alltså gratis.

**Hooken rullades tillbaka till utklipp.** Två omdesign på en dag (utklipp → fotografisk helbild → tre klippta helbilder → utklipp igen) gjorde den sämre, och helbilden var en andra renderingsväg med egen generering, gradering, scrim och egna textfärger - de flesta felen bodde där. William: "det här spårar ur totalt nu". `vox_spec.py` och `vox_render.py` återställda till `bd3dc29`, vinsterna omapplicerade ovanpå.

**Hooken ankras alltid på ord noll.** Villkoret var "bara om ankaret ligger utanför de tre första orden", så ett ankare på ord två slapp igenom och tio bildrutor stod tomma.

## Nuläge

Fungerar: hela kedjan från PubMed-abstract till köad video går på egen hand. Två studier byggda och godkända (24 och 20 beats, dötid 0,8s respektive 2,2s). En tredje underkändes automatiskt.

Trasigt/svagt: hooken är ett litet utklipp som William inte gillar men som fungerar. `mashed-food` läser som grå massa. Bilddomaren failar öppet (godkänner) om JSON-svaret inte går att parsa.

## Blockerare och öppna frågor

- **William har inte sett de tre senaste videorna.** Hans bedömning avgör om grindarnas trösklar sitter rätt; talen säger bara att dötiden är borta, inte att videon är bra.
- Telegram-godkännande och `/videoprod` är designade och godkända i princip men **inte byggda** - William: "vi väntar med skillen". Ett kort per kväll, inte ett per studie.
- Hooken: han vill att den ska vara mer lockande men sa åt mig att inte röra den förrän resten är verifierat rent i två körningar.

## Nästa upp

1. Låt William se videorna och kalibrera trösklarna mot hans dom.
2. Kör ytterligare två-tre studier genom kedjan på otestade pelare (P2, P3, P6) - allt är testat på mat och sömn.
3. Hooken, när han säger till. En idé som inte provats: låt hooken vara *tre* utklipp med hårda klipp, alltså energin från den kapade helbildsversionen men i kollagets värld.
4. Telegram-kortet + `/videoprod` när videokvaliteten är godkänd.
5. `mashed-food` och andra props som läser otydligt - bilddomaren kan svepa biblioteket igen med hårdare krav på läsbarhet.
