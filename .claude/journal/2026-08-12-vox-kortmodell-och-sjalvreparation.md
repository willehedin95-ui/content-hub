# Session: 2026-08-11/12 - vox-lanen: kortmodellen, shapes, miniatyr, sjalvreparation

Allt i `izabella-v2/`. Tva dygn i strack, det mesta drivet av att William tittade
pa varje bygge och pekade. **Las `izabella-v2/docs/HEALTH-HANDOVER.md` forst** -
dess forsta stycke ar skrivet for den har overlamningen.

**Atergangspunkt:** `git reset --hard natt-2026-08-11-utgangslage` (Williams
sista godkanda lage innan nattens arbete). Assets-backup:
`/tmp/vox-assets-2026-08-11.tgz`.

## Vad som gjordes

**KORTMODELLEN ersatte overlappsregeln.** En bild levde forut till bilden EFTER
nasta, med tak pa tre samtidiga. William: "bilder ligger kvar for lange sa de
visas tillsammans med nasta sak som sags" och "tre bilder samtidigt och en byts
ut hela tiden sa det blir omojligt att hanga med". Ett KORT ar nu antingen en
stor bild eller ett par sma, och hela kortet byts pa en gang. Matt pa samma
studie: max samtidiga 3 -> 2, bild kvar nar nasta kom 2,3s -> 0,0s,
medeltackning 15,1% -> 21,7%, dotid 2,2s -> 0,2s.

**Grindarna vandes.** De kravde forut att minst 20% av videon visade tva bilder
och att ingen stod ensam mer an 1,6s - alltsa exakt det William underkande. Nu
ar fler an tva ett fel.

**SHAPE-BIBLIOTEKET.** Pil pa bytespar, kryss pa negationer, graf som ERSATTER
en bild som inte gar att visa arligt. En roll var, sa de aldrig moter varandra.
De avmattas i kod - modellen gav forstoringsglaset 0,68 och 0,80 i mattnad tva
forsok i rad, och en markering ar svart tusch per definition.

**MINIATYR med rubriken inbakad**, som ruta noll. Jag pastod flera ganger att
bildmodeller inte klarar text; det var fel och mitt eget study-label bevisade
det samma dag. Textforbudet ar vant: oombedd text avvisas, begard text tillats.

**GRANSKNINGEN IN I KEDJAN** (steg 5 av 8) och sedan vidare till att FA BYTA
bilder den underkanner. De andra grindarna ser var sin skiva: kritikern jamfor
text mot text, bilddomaren en nygenererad bild mot sin beskrivning, matgrindarna
raknar tal. Ingen sag bilden bredvid ordet - och det ar dar alla bildvalsfel
bodde.

**MANUSSTRUKTUR:** hook, itch, proof, payoff, move. Itchen saknades - andra
meningen ska saga att nagot andrar allt utan att saga vad. Plus
stallningstagande (korpusens starkaste delningslever) och en loop dar sista
meningen moter den forsta.

## Beslut, med skal

**Rent klipp mellan kort, ingen overlappning.** En overlappning pa 0,25s
provades: tva solobilder ar bada 920 px och bada pa samma punkt, sa
krocklosaren kompenserade med fyra krympomgangar a 14% och tackningen foll till
10%. Noll ar det enda talet som inte satter tva stora bilder pa samma plats.

**Linje vid riktning, staplar vid jamforelse.** Jag bytte till linjen pa
Williams dom om en stapel som inte sade vad den jamforde - ratt dar. Men "twice
as much" ar en jamforelse, och da ar tva staplar precis vad bilden ska visa.

**Text-hooken byggdes och togs bort igen.** Korpusen sager tre hookar i de
forsta sekunderna, vilket ar tekniskt riktigt, men rubriken star redan i
miniatyren och samma ord under bilden blev en andra rubrik. Miniatyren AR
text-hooken - den ses fore klicket.

**CRF 19 -> 23.** 58 MB for 56 sekunder sprangde Supabases tak EFTER att alla
credits brunnit. CRF 23 ger 30 MB och 1,97 av 255 i skillnad, osynligt.

**Reparationen far en omgang, aldrig en loop.** Samma skal som hooken rullades
tillbaka en gang: tva omdesign av samma sak i rad gor den samre.

## Nulage

Fungerar: hela kedjan fran PubMed till fardig video, med atta steg och ett
tjugotal grindar. Tre videor byggda med kortmodellen, alla rena. Miniatyren
genereras med korrekt rubriktext. Granskningen hittade en dod ruta William
aldrig sag.

Obeprovat: **sjalvreparationen har aldrig fullbordat en lyckad omgang.** Forsta
skarpa korningen bytte fyra bilder, tva av dem valde samma slug, dubblettgrinden
underkande specen och allt rullades tillbaka. Bada felen ar lagade men fixen ar
inte kord an.

## Blockerare och oppna fragor

- **Rosten kraver Higgsfield-MCP och kan inte anropas fran cron.** Det ar den
  enda biten som hindrar verklig automatik: fas 2 maste koras vid datorn.
- **Kon ar tom och cron ar pausad.** Kontot har 5 poster, alla byggda med den
  gamla maskinen. Vi optimerar mot en enda datapunkt (87% completion, noll
  delningar) fran innan allt det har fanns.
- Bildvalen ar fortfarande svagaste lanken. Mekanismen finns nu men ar obevisad.

## Nasta upp

1. Bygg nagra videor och fyll kon - eller ta rostproblemet forst, sa kedjan kan
   ga utan William. Hans val, fragan ar stalld.
2. Lat sjalvreparationen fullborda en omgang och verifiera resultatet.
3. Sla pa cron och borja mata. Trettio dagar enligt HEALTH-PLAN.
4. `shape-check` och `shape-circle` saknar triggers.
