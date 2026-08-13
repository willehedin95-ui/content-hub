# Session: 2026-08-13 - Onsjö: annonskonto, spårning, kampanj och första Genesis-körningen

Fortsättning på `2026-08-13-onsjo-funnel.md` samma dag. Allt arbete ligger i `onsjo/`, plus ett
nytt workspace i content-hubs databas. **Ingen content-hub-kod ändrad.** Full detalj i
`onsjo/HANDOVER-2026-08-12.md`, som är den fil nästa agent ska läsa först.

## Vad som gjordes

**Annonsinfrastrukturen är klar.** Annonskonto `act_1023872310418716` ("Stefan Hedin", Incensor
AB, SEK), pixel `1061946796309495`, Facebook-sida `1339413035915987` och Clarity-projekt
`y1qfzxt9fa`. Kontot och pixeln via Marketing API, sidan och Clarity i webbläsaren eftersom
inget av dem går via API.

**Spårningen ligger i en fil**, `onsjo/spar.js`, deployad till `/spar.js` och inläst på
artikeln, `/boka/` och underlaget men inte på mejlvyn. `sparLead()` skickar `Lead` när formuläret
går igenom. Verifierat skarpt: `facebook.com/tr/?...&ev=PageView` svarar 200 och Metas eget
`last_fired_time` bekräftar, Clarity POST:ar till `z.clarity.ms/collect`.

**Kampanjen är byggd men EJ publicerad.** Webbplats som konverteringsplats, `Lead` som händelse,
Sverige, lägsta ålder 25, sidan Stefan Hedin, EU-uppgifter ifyllda.

**Eget workspace `onsjo` i content-hub** med produkten `onsjo-415a` och 18 produktbilder som
pekar rakt på underlagssidans publika URL:er. Skapat med `scratchpad/skapa-onsjo.py`, idempotent.

**Första Genesis-körningen: två koncept, fem bilder.** Resultatet duger inte som test, se nedan.

## Beslut

**Eget workspace i stället för produkt i ett befintligt.** Tre saker sitter på workspace-nivå och
hade landat fel: `languages` (happysleep är sv/da/no och hade fött danska och norska rader),
`force_no_product` (doginwork har `true` och hade hindrat huset från bilderna) och Meta-push, som
går mot workspacets annonskonto. Hydro13 var mekaniskt rätt men är det enda workspacet med
levande annonser. Kostnaden för ett eget visade sig vara en rad i `workspaces`.

**Ingen Special Ad Category.** Jag påstod först att Housing gällde efter att ha sett kategorin i
rullistan. William invände. Metas egen hjälpsida säger inte att den är obligatorisk i Sverige,
bara att begränsningarna gäller "certain countries in Europe" utan att namnge dem. Kategorin går
inte att ändra efter att kampanjen skapats medan ett avslag syns på timmar, så asymmetrin pekar
åt att prova utan.

**Godkände inte Meta Lead Ads Terms.** De gäller bara instant forms, som vi inte använder.
Konverteringsplats bytt till webbplats i stället, då försvann felet.

## Läget

Fungerar: domänen, formuläret, mejlflowet, bokningen, spårningen, annonskontot, sidan, pixeln,
Clarity, workspacet, produktbanken.

Trasigt eller oanvändbart: **båda Genesis-koncepten har samma hook** och delvis ordagrant samma
brödtext. **Ingen av de fem bilderna föreställer fastigheten.**

Ej gjort: annonsmaterial som duger, budget (står på standard 125 kr/dag), Stefans kort som
betalmetod, noindex borttaget.

## Blockerare och öppna frågor

1. **Hook-dedup saknas i pipelinen.** `generateVettedConcepts` kör `generateHooks` en gång före
   loopen och delar samma hook-array till alla koncept. Loopen varierar bara `angle`.
   Hook-mångfald inom en batch är arkitektoniskt omöjlig. **Fråga till William, obesvarad:** laga
   i `genesis-pipeline.ts` (ca tio rader, gäller alla workspaces) eller kringgå med hookBan i
   segmentfältet per körning?
2. **Referensbilderna används inte.** `reference_image_count: 0`, `reference_strategy: "none"` på
   alla fem bilder. Bild-briefen väljer strategi själv och valde stilar där ingen produkt hör
   hemma. **Fråga till William, obesvarad:** tvinga `referenceStrategy: "product"` för det här
   workspacet?
3. **Två bilder är trasiga.** En skrev ut sina egna instruktionsetiketter som synlig engelsk text
   ("LEFT SIDE PAIN STATE"), en har förvrängda bokstäver i "OM DU".
4. **Intäktspåstående i copyn.** Koncept 2 skriver "genererar intäkter", vilket projektets regel
   förbjuder. Domaren flaggade meningen men bad om **mer** intäktsbevis, den känner inte till
   regeln.
5. **Driftkostnaden saknar villans fastighetsavgift.** Mäklarens 8 524 är takbeloppet för
   kalenderår 2021, verifierat mot Skatteverkets tabell. Rätt siffra för 2026 är 10 425 och
   riktig total ~119 700, inte 109 258 som står på underlagssidan.
6. **Visningsdatan från Marie och Stefan.** De var med på alla privata visningar förra gången men
   har inte tillfrågats om vad de som kom sa att de ville göra med stället.

## Nästa gång, i ordning

1. Svara på de två frågorna ovan, de blockerar allt annonsmaterial.
2. Kör om Genesis, ett koncept i taget med hookBan och explicit angle.
3. Driftkostnaden med Stefan, siffran ligger publikt och underskattar.
4. Budget och Stefans kort, sedan noindex bort.
