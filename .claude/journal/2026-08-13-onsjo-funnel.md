# Session: 2026-08-13 - Onsjö 415A, hela funneln byggd och kopplad

Allt arbete ligger i `onsjo/`, **ej content-hub**. Full detalj i
`onsjo/HANDOVER-2026-08-12.md`, som är uppdaterad genom hela sessionen och är den fil
nästa agent ska läsa först.

## Läget just nu

Tekniken är klar och verifierad. Kvar är innehållsbeslut och annonskontot.

| Del | Status |
|---|---|
| Domän `stefanhedin.se` | live, noindex, DNS på Cloudflare |
| Artikeln | live, formuläret skarpt |
| Underlagssidan `/onsjo-415/underlag/` | live, hero-bild, 49 foton, 3 planritningar, bokning |
| Bokningssidan `/boka/` | live, cal.com inbäddad |
| Läsvy för Stefan `/onsjo-415/mejlen/` | live, alla fem mejl |
| Mejlflow i MailerLite | fem mejl klara, **inaktiverat** |
| Utträde vid bokning | byggt och testat skarpt |
| Mejl in och ut på domänen | MX, SPF, DKIM klara |

## Det viktigaste nästa agent behöver veta

**Erling får nämnas som faktauppgift men inget ska styra folk till honom.** Alla ska gå via
Stefan först, som sållar innan de skickas vidare till visning. Hans namn står kvar i artikeln
och underlaget, men ingen kontaktväg finns någonstans, och bokningssidan säger bara "Pris och
budgivning hör till mäklaren".

**All mejltext genereras av `onsjo/bygg-mejl-zip.py`.** Skriv aldrig direkt i MailerLites
kodeditor: den autokompletterar taggar och lämnar `p>` synligt i mejlet, och deras AI-agent
förstörde brevet när den ombads städa. ZIP-import är den enda väg som fungerar.

**Mejl 2-5 inleds med en påminnelse om vem Stefan är.** Kom från Williams test: efter tre dagar
minns folk inte vem som hör av sig.

## Fällor som kostade tid

- `create_automation` i MailerLite-connectorn kastar fel på sitt eget svar men skapar
  automationen ändå. Kolla med `list_automations` innan du gör om anropet.
- `update_automation_email`s `step_index` följer inte stegordningen och är inte stabil mellan
  anrop. Skicka innehållet direkt i `create_automation` i stället.
- Cloudflare Pages serverar fallback-HTML för okända sökvägar, även för bildförfrågningar.
  Det gav en sida utan bilder på `/onsjo-415`. Löst med `dist/_redirects`.
- `UID` är reserverat i zsh och dödar skript som hanterar cal.coms boknings-uid.
- MailerLites domänverifiering kräver en TXT-post som varken API:t eller deras dokumentation
  nämner. Den syns bara i det manuella flödet bakom "Or manually authenticate your domain".

## Öppna fakta som måste redas ut före annonsering

1. **Driftkostnaden saknar villans fastighetsskatt.** Stefans 109 258 innehåller bara
   verksamhetsbyggnadens 9 760, inte småhusenhetens 8 524. Riktig total runt 117 800. Siffran
   står på underlagssidan och i mejl 2.
2. Hallandspostens hero-bild i artikeln ligger publikt utan tillstånd.
3. Årtalskrocken 2022 mot 2023, och om rummen fortfarande är möblerade.
4. Boksluten för Milentum Group AB finns nu. Beslut saknas om de ska ligga publikt.
   Rekommendation: nej, de hör hemma i samtalet med Stefan.

## Nästa steg

Stefans feedback på mejlen, rumsnamn till planritningen, porträtt till bokningssidan. Sedan
annonskonto och Facebook-sida, slå på automationen och ta bort noindex.
