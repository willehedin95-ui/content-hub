# Läget 2026-08-13 - TVÅ parallella sessioner samma dag

Två spår kördes samtidigt. Läs det som rör din uppgift, båda handoffs finns i sin helhet:

- **Vox / izabella-v2:** `.claude/journal/2026-08-13-hookar-kvarhallning-facebook.md`
- **Onsjö / annonser:** `.claude/journal/2026-08-13-onsjo-annonser-genesis.md`
  (funneldelen tidigare samma dag: `2026-08-13-onsjo-funnel.md`)

---

## BRÅDSKANDE, deadline 11:00 den 14 augusti

`iz_queue` 2026-08-14 pekar på en **gammal** sockervideo (PMID 33684506) med den svaga öppningen
"You think sugar is sugar...". Manuset är omskrivet i `scratchpad/draft-33684506.json` och rösten
genererad, men **bygget hanns aldrig köras**. Görs det inte före 11:00 går den svaga hooken ut.
Kommando och detaljer i vox-journalen.

---

## Vox i tre rader

**Kvarhållningen stryper räckvidden, inte kvaliteten.** Snitt-tid mättes för första gången idag:
1,9 till 8,8 sekunder. `REEL_METRICS` hade begärt `ig_reels_avg_watch_time` sedan dag ett men
`iz_results` saknade kolumn, så svaret lästes och slängdes. Kolumnerna finns nu. Hookramverket
ligger i `docs/HOOK-FRAMEWORK.md`, fyra grindar och varje enskild fångade befintliga fel.
Facebook är halvklart och blockerat på saknad `pages_manage_posts`, **läs Metas dokumentation
innan något klickas**, fyra godkännanderundor brändes på gissningar.

---

## Onsjö: allt utom annonsmaterialet är klart

Arbetet ligger i `onsjo/`, **läs `onsjo/HANDOVER-2026-08-12.md` först**. Ingen content-hub-kod
ändrad, bygget verifierat grönt.

Klart och verifierat: domän, formulär, mejlflow, bokning, spårning (`spar.js`, pixel + Clarity,
båda mätta skarpt), annonskonto `act_1023872310418716`, sida `1339413035915987`, pixel
`1061946796309495`, Clarity `y1qfzxt9fa`, kampanjutkast med webbplats som konverteringsplats och
`Lead` som händelse. **Kampanjen är inte publicerad.**

Nytt workspace `onsjo` i hubben med produkten `onsjo-415a` och 18 produktbilder som pekar rakt på
underlagssidans publika URL:er.

### Två frågor ligger obesvarade hos William och blockerar allt annonsmaterial

1. **Hook-dedup.** `generateVettedConcepts` kör `generateHooks` en gång före loopen och delar
   samma hook-array till alla koncept, loopen varierar bara `angle`. Hook-mångfald inom en batch
   är arkitektoniskt omöjlig, och första körningen gav två koncept med identisk hook och delvis
   ordagrant samma brödtext. Laga i `genesis-pipeline.ts` (ca tio rader, gäller alla workspaces)
   eller kringgå med hookBan i segmentfältet per körning?
2. **Referensbilderna.** `reference_image_count: 0` och `reference_strategy: "none"` på alla fem
   genererade bilder. De 18 fotona användes aldrig och **ingen bild föreställer fastigheten**.
   Tvinga `referenceStrategy: "product"` för workspacet?

### Övrigt öppet

- Driftkostnaden på underlagssidan säger 109 258 men saknar villans fastighetsavgift. Mäklarens
  8 524 är takbeloppet för **2021**, verifierat mot Skatteverkets tabell. Rätt för 2026 är
  10 425 och riktig total ~119 700. Stäm av med Stefan.
- Copyn innehåller ett intäktspåstående ("genererar intäkter") som projektets regel förbjuder.
  Domaren bad om **mer** intäktsbevis, den känner inte till regeln.
- Marie och Stefan var med på alla privata visningar förra gången men har inte tillfrågats om vad
  spekulanterna sa att de ville göra med stället. Enda riktiga målgruppsdatan som finns.
- Budget står på standard 125 kr/dag, Stefans kort saknas som betalmetod, noindex kvar.
