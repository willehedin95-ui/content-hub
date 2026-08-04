# Session: 2026-08-03 -> 2026-08-04 - Onsjö 415A advertorial: från fem underkända utkast till publicerad sida + funnel-plan

Allt arbete ligger i `/Users/williamhedin/Claude Code/onsjo/` (flyttat ut ur temp-scratchpad).
Ingen kod rörd i content-hub. Sidan live på `https://onsjo415a.pages.dev` (noindex).

## What was done

**Läste hela advertorial-korpusen först** (Williams uttryckliga krav efter fem underkända utkast
i förra sessionen): Copy Coders "Advertorial Writing Masterclass" (Mario Castelli, 2 tim),
Genesis Catechisms "Advertorials and How to Write Them" (Heath, 2 tim), CarlWeische "How $100M
brands write advertorials" (8-stegsmallen), advertising_jans native-guide (6 delar, produkten i
bakre halvan), wiki `native-advertorial-ads` + `pdp-landers-conversion`, samt Great Leads
(Masterson) för lead-typerna. Sammanfattat i `onsjo/MALL-advertorial.md` tillsammans med
svepfilen och diagnosen av varför de fem första utkasten föll.

**Diagnosen som löste det:** alla tidigare utkast öppnade med berättaren och huset. Karma-sidan
William själv pekade på (`go.karmaitems.com/17-jetsetters`) öppnar med LÄSARENS osynliga problem
och kommer till sin egen historia först fyra skärmar ner. Plus: ingen mekanism, fastigheten
avslöjad för tidigt, ingen separation mellan läsarens liv nu och livet hen vill ha.

**v6 underkänd** (för snäv, skriven till folk som redan vill driva hotell). **v7 godkänd**:
bred ingång för kall Meta-trafik i hela Sverige, söndagskvällstanken -> "vad ska vi leva av" ->
det tredje sättet -> först därefter fastigheten. "Ingen av oss hade jobbat på hotell" uppgraderad
till bärande argument, optionaliteten (retreat/kontor/kursgård) före fastighetsfakta.

**Byggde sidan i karma-layout** (sans-serif, 680 px spalt, fet rubrik, byline, full-bredd hero,
sifferrad, citatrutor, CTA mitt i + slut). Hero = Hallandspostens pressfoto på Marie och Stefan
framför receptionsskylten. Bilder komprimerade 5,2 MB -> 2,4 MB.

**Publicerat på Cloudflare Pages**, projekt `onsjo415a`, via `npx wrangler@4 pages deploy` med
`CF_PAGES_API_TOKEN`/`CF_PAGES_ACCOUNT_ID` ur content-hubs `.env.local`. Noindex-meta +
robots.txt disallow så länge den är utkast.

**Recensionssektionen omgjord** efter Williams input: bort med uppdelning per resenärstyp, in med
tre källor (8,9 Booking / 4,7 Google / 4,6 Tripadvisor) och "hundratals omdömen" i stället för
399. Nya citat hämtade från Tripadvisor via in-app-browsern (WebFetch fick 403): kock-citatet som
följs av **"Kocken var jag."** är sessionens starkaste enskilda copy-fynd.

**Stefans egen omskrivning (ChatGPT-PDF) genomgången.** Tagit in: Maries bakgrund som
hundtränare + frågan "Kan inte du bygga en kursgård?", kvällen med sångerskan, personalens namn
(Anna, Imke, Marinette), att den andra byggnaden är taxerad som kommersiell, internationella
gäster + fullbokade somrar, "öppet kök mot loungen" i stället för storkök, samt hans version av
varför de säljer. Avvisat: hans nya rubrik (retorisk fråga + klyscha, tappar pengalöftet),
borttagandet av "Det som är sämre", och påståendet att en bra villa i Halmstad kostar 5-7 mkr.

**Rubrikarbetet:** sex egna förslag underkända, sedan Genesis-körning med ny brief (kall trafik,
bara indirekta lead-typer, hela listan över underkända rubriker med skäl). 5 bottar,
80 rubriker (`onsjo/genesis/out3/`, sammanställda i `ALLA-RUBRIKER.md`). Därefter Mario-bottarna
(`out4/`), som gav den skarpaste diagnosen: nästan alla 80 leder med SLUTSATSEN i stället för att
öppna en story-loop. William pratade sedan med Mario-botten själv och ville ha hans tre sista
rubriker översatta plus fler i samma anda.

**Funnel-research** (Williams poäng att Genesis-korpusen borde täcka det): vaulten har det i
`wiki/topics/brunson-funnels-playbook.md`. Phone/application-funnel är enda formatet för
3 000-100 000 USD, 4-Question Close är "best-in-class" för high-ticket, och vår advertorial har
redan ett namn i playbooken: **Cold Traffic Article Bridge** (Epiphany Bridge i artikelform,
1 500-3 000 ord). Kompletterat med företagsmäklarnas process (kvalificering före utlämnat
material, köparen träffar säljaren) eftersom vaulten saknar fastighetsförsäljning.
Levererat som `onsjo/plan-intresseanmalningar.md`, skriven för Marie och Stefan att läsa upp
för mäklaren.

## Decisions made

- **Vinkel:** bo och tjäna pengar på samma adress, drömmen först, fastigheten sent. Stefan i
  jag-form. Bekräftad av Mario-botten som rätt vinkel för kall trafik.
- **Rubriken står kvar** som den är ("På den här tomten står två hus...") och A/B-testet skjuts upp.
- **Mätning:** Microsoft Clarity med varianten som custom tag, INTE en egen event-pipeline. Den
  enda siffra som räknas på riktigt är antalet intresseanmälningar.
- **Formuläret:** mjuk ask (begär underlaget) som huvudväg, visning sekundärt, plus två
  kvalificeringsfrågor (var i processen + behöver du sälja något först). Frågan om vad de ska
  använda byggnaden till slopad, den kommer för tidigt.
- **Stefan-samtalet** = 4-Question Close där fråga fyra bytts från pris till "vill du komma och
  se det?", så mäklarens uppdrag inte kränks.
- **Vi äger mejladresserna.** Nytt ad-konto och ny FB-sida skapas.
- **Spanien:** Stefans version gäller, de flyttar inte permanent.
- **Energiklass E struken** från sidan (Stefan ifrågasätter uppgiften, Hemnet säger fortfarande E).
- **Annonsmärkning och utkastbanner borttagna** på Williams begäran. Ska tillbaka om sidan
  någon gång körs som native-placering inne i redaktionellt flöde.

## Current state

- Sidan live och verifierad på `https://onsjo415a.pages.dev`, mobil + desktop, ingen sidledes
  scroll. `index-v8.html` är källan, `dist/` är det som deployas (noindex läggs på i bygget).
- Projektet flyttat från förra sessionens temp-scratchpad till `onsjo/` i arbetsmappen, inklusive
  de 49 mäklarfotona, så det överlever tmp-rensning.
- `.claude/launch.json` har fått en post `onsjo` (python http.server, port 4640).
- Formuläret är fortfarande en attrapp. Ingenting skickas någonstans.

## Blockers / Open questions

- **Erling Miles är inte kontaktad.** Fem frågor formulerade i `plan-intresseanmalningar.md`.
  Fråga två (får Stefan prata drift med spekulanter?) avgör om mellansteget finns kvar.
- **Hallandspostens bild ligger publikt.** Tillstånd behövs innan sidan används i annonser,
  annars byte till ett av mäklarfotona.
- **2022 mot 2023:** Hemnet säger att hotellet avslutades 2022, Booking-recensionerna är från
  2023. Stefan ska svara.
- **Är rummen fortfarande möblerade** så någon kan öppna igen utan att köpa in sig?
- **Detaljplan och bygglov:** vad byggnaden får användas till är obesvarat och kommer att vara
  första frågan från varje seriös spekulant.
- **Booking-utmärkelsen** som Stefan minns går inte att verifiera, Booking.com svarar inte på
  mina anrop. Väntar på mejl eller skärmdump från honom.

## Next up

1. **När Erling svarat:** bygg formuläret skarpt via Content Hubs formulärsystem (`forms` /
   `form_submissions`, embed på CF-sidan) med de två kvalificeringsfrågorna och varianten som
   dolt fält. Sätt upp Clarity-projekt för sidan.
2. **Underlaget:** samla ihop planritningar m.m. från Erling, skriv Stefans drift-genomgång,
   och be dem spela in rundvandringsfilmen med telefonen.
3. **Rubrik-A/B** när William vill: varianter finns i `onsjo/genesis/ALLA-RUBRIKER.md` och
   `out4/mariobot.md`. En URL, slumpad variant, Clarity-tag.
4. **Nytt ad-konto + FB-sida + pixel** på sidan innan första annonskronan.
5. **Ta bort noindex och robots-disallow** vid skarp start.
