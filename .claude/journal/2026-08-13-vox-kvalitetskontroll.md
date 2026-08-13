# Session: 2026-08-12/13 - vox-lanen, kvalitetskontroll och en felprioritering

Allt arbete ligger i `izabella-v2`, committat som `b691c95`. Content-hub orört.

## Läget just nu

Fyra videor byggda. Ingen är köad utom den första.

| pmid | ämne | status |
|---|---|---|
| 33479499 | keto mot växtbaserat | **KÖAD** 2026-08-12 (concept `88003b66`) |
| 35129580 | sömn och kaloriintag | byggd, ej köad |
| 22374636 | sittande och blodsocker | byggd, ej köad |
| 28989726 | måltidsordning | byggd, ej köad, senaste |

Publicering är **fortfarande pausad** i crontab (`# PAUSAD` framför build och publish). Scout, insights och veckorapport kör.

## Det viktigaste nästa agent behöver veta

**Williams enda kriterium, ordagrant 2026-08-13:** *"Det enda jag bryr mig om är att bilderna matchar det som sägs i videon."* Stil, färg och textur bryr han sig uttryckligen inte om. Han har aldrig kommenterat stilbrott på en enda video.

Jag brände en hel natt på just stil - fem detektorer, alla misslyckade - och föreslog dessutom att generera om hela biblioteket. Han avvisade det rakt: *"Vi ska inte generera om ett skit."* Läs `docs/qc-facit.json` innan du prioriterar något; det innehåller bara hans faktiska citat.

**Och jag hittade på hans facit.** Första versionen listade ett stilbrott som "hittat av William" när det var jag som hittat det, och saknade flera av hans riktiga klagomål. Listan är omskriven. Skriv aldrig in något i den som inte är ett citat.

## Vad som gjordes

**Manusförfattaren är nu Claude, inte gemini.** `--phase candidates` sveper 25 träffar per query mot tidigare 5, berikar med citeringar från Europe PMC (gratis, ingen nyckel) och screenar jäv. Vattenstudien PMID 30285042 visade sig ha fyra författare anställda av Danone - en studie om att dricka vatten. `--phase abstract --pmid X` ger hela abstractet med jävsflagga.

**Nya grindar, alla kalibrerade på uppmätta värden:**

- Tystnad. Fångade Williams 2,02-sekunderspaus exakt. Kalibrerad på tio egna röster som ligger 11-35% tysta. Orsaken är alltid för många punkter - varje punkt kostar TTS:en ungefär en sekund.
- Täthet på **riktiga** ordtider, inte gissade. TTS varierar 2,22 till 3,38 ord per sekund och uppskattningen slog fel åt båda håll.
- Rubriklängd 2-5 ord. Saknades helt; min egen rubrik var åtta.
- Beat ankrat på manusets sista ord stryks tyst. **6 av 12 historiska utkast hade felet.**
- Listkort med tre bilder som kommer in var för sig och går ut tillsammans.
- Takeaway-paus 1,0s med bilderna kvar under den.

**Bildkritikern körs nu även i build-fasen.** Detta är sessionens viktigaste fynd. Den satt bara i den gemini-skrivna vägen och slutade tyst köra när jag tog över manusskrivandet. Det är grinden som äger Williams enda kriterium. Mätt i efterhand fångar den **alla fyra** kända bild-mot-ord-fel, inklusive tomaten (*"a timer measures clock time, but..."*) och besticken (*"generic objects used to illustrate the abstract concept of first"*). Den fick bara aldrig se dem.

**Reparationen** passerar nu samma kritiker och har tre spärrar: hooken fredad (den bytte den mot pizzakartonger), dubblettkontroll på hela ordmängden, och återställning när en ersättare inte går att generera.

## Verktyg som finns nu

- `tools/vox_editor.py` - kortformatsredigerare som ser flera färdiga videor samtidigt **utan** formatets fredning. Hittade att alla öppningar ser likadana ut och att ordvisa captions längst ned bryter ögonrörelsen. Körs mellan videor.
- `tools/vox_audit.py` - jämför vad som **syns** mot vad specen sa. Fångade tomaten korrekt. **Inriktningen är trasig**: Higgsfields tidsstämplar driver ungefär ett beat och tre försök att kompensera konvergerade inte. Se nedan.
- `docs/run-log.tsv` - en rad per bygge. Bekräftade fel per video hittills: 1, 1, 0.
- Kontaktkartan tar nu **en ruta per bild** i stället för tolv jämnt spridda. Med tolv hittade jag två fel, med trettio hittade jag tolv.

## Mätta fakta som sparar tid

- **Kie släpper ljud tyst.** Anropet lyckas, modellen svarar "you did not provide an audio clip". Testat i två format.
- **Higgsfields `video_analysis` hör** och kostar **noll credits** på Ultimate. Transkriberar ordagrant, beskriver musik och tystnad. Startas via MCP, alltså av en agent.
- En röst kostar **~4 Higgsfield-credits**, inte 0,6 som stod i memory. Saldo 681.
- En prop kostar **4 Kie-credits** på `nano-banana-2-lite`, 8 på `nano-banana-2`. Saldo ~13 500.
- Lite-modellen duger för props men gav en fotorealistisk hamburgare. Miniatyren kör den dyrare.

## Blockerat / öppna frågor

- **`vox_audit` inriktning.** Rätt fix är att **bygget skriver ut sin egen tidslinje** (vilken prop ligger i rutan när) i stället för att gissa ur Higgsfields tidsstämplar. Bygget vet det exakt. Det är den enda kontroll som fångade tomaten och den är värd att få rätt.
- **Facebook-publicering ej byggd.** Nuvarande token är Instagram Login (`IGAG…`) och fungerar bara mot graph.instagram.com; mot graph.facebook.com svarar Meta kod 190. Kräver Facebook Login, sidtoken via `/me/accounts` och trestegsflödet mot `/{page-id}/video_reels`.
- **Duplicerade konstanter** mellan `vox_render` och `vox_validate` gick isär två gånger på en dag och kostade ett bygge var. Bör bli en källa.
- **Captionplacering.** Editorn hävdar att ett ord i taget längst ned skadar retention och föreslår tre till fem ord under bilden. Williams beslut, ej rört.

## Nästa steg, i prioritetsordning

1. **Kör en ny kedja och se hur många av Williams invändningar som försvinner** nu när bildkritikern faktiskt körs. Det är det enda sättet att veta om fixen räcker.
2. Låt bygget skriva sin tidslinje så `vox_audit` blir tillförlitlig.
3. Slå ihop de duplicerade konstanterna.
4. Fråga om captionplaceringen.

**Rör inte stil, färg eller textur om han inte tar upp det själv.**
