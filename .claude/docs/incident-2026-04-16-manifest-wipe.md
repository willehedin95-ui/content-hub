# Incident Report: Halsobladet Manifest Wipe (2026-04-16)

## Vad hande?

Den 16 april 2026 forsvann alla landing pages fran den svenska Cloudflare Pages-sajten. Nar man besoke t.ex. `halsobladet.swedishbalance.se/happysleep-se` fick man en 404 istallet for sidan.

Problemet var att **manifestet** (en lista i databasen over alla filer som finns pa sajten) hade blivit overskrivit. Istallet for ~200 sidor inneholl det bara 1 sida.

## Varfor hande det?

Tva saker i kombination:

### 1. Tyst felhantering ("silent error swallowing")

Nar systemet forsoke ladda listan over existerande sidor fran databasen sa anvande koden den har logiken:

```
om databasfel → returnera tom lista
```

Det betyder att om Supabase hade en kortvarig hicka (timeout, natverksfel, overbelastning) sa tolkade systemet det som "det finns inga sidor". Istallet for att saga "jag kunde inte lasa databasen, jag ger upp" sa korde den vidare med en **tom lista**.

### 2. Hela objektet overskrevs varje gang ("read-modify-write race condition")

Nar en ny sida publicerades sa:
1. Laste hela listan fran databasen
2. La till den nya sidan i listan
3. Sparade **hela listan** tillbaka

Om steg 1 misslyckades (pga databasfel) sa blev listan tom. Sen sparades den tomma listan + 1 ny sida = allt annat forsvann.

Om tva publiceringar korde samtidigt (t.ex. blogg-autopiloten korde svenska + danska parallellt) sa kunde de ocksa overskriva varandra: Bada laser listan, bada lagger till sin sida, den som sparar sist vinner - den andras sida forsvinner.

### Tidslinje

- Systemet publicerade blogginlagg automatiskt via cron-jobb
- Vid nagon tidpunkt fick databasen en hicka
- `loadManifest()` returnerade `{}` istallet for att kasta fel
- `saveManifest()` sparade `{ny_sida}` och overskrev de ~200 befintliga sidorna
- Alla gamla sidor forsvann fran Cloudflare

## Hur fixades det?

### Den omedelbara fixen (commit `b941f88`)

1. **`loadManifest()`** kastar nu fel pa riktiga databasfel istallet for att returnera tom lista. Enda undantaget ar "raden finns inte" (PGRST116), som ar ett legitimt fall for forsta deployen.

2. **`mergeManifest()`** (ny funktion) - Istallet for att lasa hela listan, andras den, och skriva tillbaka den, sa gor vi nu en **atomic merge** direkt i Postgres via en RPC-funktion. Det betyder att databasen sjalv slar ihop den nya sidan med de befintliga - det kan inte bli nagon race condition.

3. **Shrink guard** i `saveManifest()` - Om nagot forsaker skriva en lista som ar *mindre* an den som redan finns sa vagar systemet och kastar fel. Skyddsnät ifall nagon anvander den gamla funktionen.

---

## Relaterade buggar som hittades och fixades

Efter den omedelbara fixen gjorde vi en full granskning av hela kodbasen for att hitta **samma typ av bugg** pa andra stallen. Vi hittade 11 till.

---

### P0-1: Settings-sidan overskrev allt (commit `5421aac`)

**Vad var fel:** Nar du sparade nagot pa Settings-sidan (t.ex. Meta Pixel ID) sa skickades **alla** settings pa en gang. Om du hade tva flikar oppna och sparade i bada sa forsvann det du andrat i den forsta fliken.

**Exempel:** Flik A andrar "Meta Pixel ID". Flik B andrar "GA4 ID". Flik B sparar sist och skickar ALLA settings - men den har fortfarande det GAMLA Meta Pixel ID:t. Nu ar ditt Meta Pixel ID-byte borta.

**Hur det fixades:** Ny Postgres RPC `merge_workspace_settings` som atomiskt slar ihop bara de nycklar som skickas, utan att rora andra nycklar.

---

### P0-2: Ad copy translations overskrev varandra (commit `bdc6173`)

**Vad var fel:** Nar systemet oversatte annonstexter (t.ex. svenska och danska) sa laste det hela `ad_copy_translations`-objektet, la till sin oversattning, och skrev tillbaka allt. Om tva oversattningar korde samtidigt (eller om du redigerade for hand i UI:t medans autopiloten oversatte) sa overskrev den ena den andra.

**Hur det fixades:** Tre nya Postgres RPCs:
- `merge_ad_copy_translations` - atomisk merge (samma monster som manifestet)
- `approve_ad_copy_translations` - godkanner oversattningar direkt i databasen
- `merge_video_ad_copy_translations` - samma for video-jobb

Alla stallen som skrev `ad_copy_translations` konverterades: image-jobs API, video-jobs API, translate-copy, approve-translations, och autopilot-translations.

---

### P0-3: Tysta fel vid sitemap/blogg-homepage/RSS-deploy (commit `5ee1b41`)

**Vad var fel:** Efter att en blogg-artikel publicerades sa uppdaterades sitemap, blogg-hemsidan och RSS-flödet i bakgrunden. Men koden anvande `.catch(() => {})` - om nagot av det misslyckades sa svaldes felet helt tyst. Du fick "Publicerat!" medans blogg-hemsidan visade gamla artiklar.

**Hur det fixades:** Ny helper `runDeployStep()` som:
1. Vantar pa att varje steg blir klart (istallet for fire-and-forget)
2. Om det misslyckas: loggar felet till `autopilot_actions`-tabellen OCH skickar Telegram-alert
3. Abortar INTE resten (artikeln ar redan publicerad, men du far reda pa att hemsidan inte uppdaterades)

---

### P0-4: Inga realtids-varningar for auto-kill (commit `669fe2e`)

**Vad var fel:** Strategy engine-cronen pausar (dodar) annonser som bloder pengar. Men:
- Om en annons misslyckades att pausas (t.ex. Meta API-fel) sa svalde koden felet tyst. Annonsen fortsatte kosta pengar.
- Du fick ingen Telegram-notis nar en annons dodades - bara en sammanfattning i slutet av alla kills.

**Hur det fixades:**
- `pauseAdSetAndAds()` samlar nu fel per annons och kastar om nagot gick fel. Du vet exakt vilka annonser som inte pausades.
- Varje kill (lyckad eller misslyckad) skickar nu en Telegram-notis **direkt** med: annonsens namn, varfor den dodades, 7-dagars spend/köp, hur lange den kort, och eventuellt felmeddelande.

---

### P1-1: Ingen verifiering att sidan faktiskt fungerar efter deploy (commit `cd64a5d`)

**Vad var fel:** Cloudflare API sa "deploy klar", vi markerade sidan som publicerad - men ingen kontrollerade att URL:en faktiskt fungerade. Halsobladet-buggen hade kunnat upptackas direkt om vi bara provat att besoka sidan.

**Hur det fixades:** Ny `verifyDeployedUrl()` som efter varje deploy:
1. Besoker URL:en (3 forsok, 2 sekunders mellanrum)
2. Kollar att HTTP-status ar 200
3. Kollar att sidans storlek ar over 500 bytes
4. Kollar att sidan innehaller `</html>` (dvs riktig HTML, inte en felsida)

Om verifieringen misslyckas: sidan markeras fortfarande som publicerad (deploy har redan gatt igenom), men du far en **varning** i Content Hub OCH en Telegram-alert. Du kan da fixa det direkt istallet for att upptacka det en vecka senare.

---

### P1-2: Annonser kunde pushas till doda landing pages (commit `cd64a5d`)

**Vad var fel:** Nar en annons pushades till Meta fick den en landing page URL fran databasen. Ingen kontrollerade om den URL:en faktiskt fungerade. Om sidan hade gatt ner sedan den skapades sa betalade du for klick till en 404-sida.

**Hur det fixades:** Ny `verifyUrlAlive()` som innan varje Meta-push:
1. Besoker landing page URL:en med 5s timeout
2. Kollar att den svarar HTTP 200 och att sidan ar over 500 bytes
3. Om den ar nere: skippar den marknaden och ger tydligt felmeddelande istallet for att pusha en dod annons

---

### P1-3: Workspace-laddning returnerade tomt pa databasfel (commit `cd64a5d`)

**Vad var fel:** Exakt samma bugg som manifestet. Om Supabase hade en hicka sa returnerade `getAllWorkspaces()` en tom lista `[]`. Hela appen renderade "inga workspaces" och du var utlast.

**Hur det fixades:** `getAllWorkspaces()` och `getWorkspace()` kastar nu fel pa riktiga databasfel. Enda undantaget ar "workspace hittades inte" (PGRST116), da faller den tillbaka till default-workspacen som forr.

---

### P1-5: Budgetskala utan tak (commit `cd64a5d`)

**Vad var fel:** "Skala +20%"-knappen i morning brief hade inget max. Fem klick = budget +149%. Tio klick = budget +519%. Ingen cooldown heller - du kunde klicka hur manga ganger som helst.

**Hur det fixades:**
- **Hard cap**: Max budget ar nu 50 000 SEK/dag (default, kan andras i workspace settings via `max_campaign_budget_sek`)
- **24h cooldown**: Om du redan skalat en kampanj senaste 24 timmarna far du ett felmeddelande istallet for att skala igen

---

### P1-6: Manifest-laddning klarade inte kortvariga natverksfel (commit `cd64a5d`)

**Vad var fel:** `loadManifest()` (efter fixen) kastade ratt fel pa databasfel - men ett enda kort natverksfel avbrot hela deployen. Supabase kan ha korta hickor som forsvinner pa 1-2 sekunder.

**Hur det fixades:** `loadManifest()` ar nu wrappat i `withRetry()` med 3 forsok och 500ms start-delay. Bara nätverksfel och 5xx-svar retry:as - riktiga fel (permission, schema) kastar direkt.

---

### P1-7: Race conditions i bakgrundsjobb (commit `cd64a5d` - verifiering)

**Vad var problemet:** Blog-autopilotens `after()`-callback skriver till manifest 200-300 sekunder efter att HTTP-svaret skickats. Nasta spraks blogg-cron kan starta innan det forsta ar klart.

**Resultat:** Inte langre ett problem. Verifierat att:
- Varje sprak har sitt eget Cloudflare Pages-projekt (separate manifest-rader)
- Aven pa samma projekt: `mergeManifest()` ar atomisk via RPC
- Alla andra `after()`-handlers granskade - inga kvarstaende race conditions

---

## Sammanfattning

| Problem | Risk | Status |
|---------|------|--------|
| Manifest overskrivning | Alla sidor forsvinner | Fixat (b941f88) |
| Settings overskrivning | Installningar forsvinner | Fixat (5421aac) |
| Oversattningar overskrivning | Annonstexter forsvinner | Fixat (bdc6173) |
| Tysta deploy-fel | Bloggen uppdateras inte | Fixat (5ee1b41) |
| Tysta kill-fel | Blodande annonser fortsatter | Fixat (669fe2e) |
| Ingen deploy-verifiering | Doda sidor utan varning | Fixat (cd64a5d) |
| Doda landing pages i annonser | Pengar pa 404-klick | Fixat (cd64a5d) |
| Workspace-laddning svalde fel | Utlast fran appen | Fixat (cd64a5d) |
| Obegransad budgetskala | Budget i hojden | Fixat (cd64a5d) |
| Ingen retry pa manifest-laddning | Deploy misslyckas i onodan | Fixat (cd64a5d) |
| Race conditions i bakgrundsjobb | Data forsvinner | Verifierat sakertt (cd64a5d) |

## Lardomar

1. **Svald fel = tidsinstalled bomb.** Nar kod gor `.catch(() => {})` eller `if (error) return []` sa doljer den ett problem som kommer att explodera senare. Alla kanda fall ar nu fixade.

2. **Lasa-andra-skriva-tillbaka ar farligt for delad data.** Varje gang tva processer kan redigera samma databas-objekt samtidigt behover det vara atomiskt (gors direkt i databasen, inte i app-koden). Nu anvands RPCs for alla JSONB-falt som kan andras fran flera stallen.

3. **Verifiering efter action ar gratis forsakring.** En HTTP-check efter deploy kostar <1 sekund men kan spara dagar av felsökning. Samma sak for en URL-check innan Meta-push.

4. **Telegram-alerts behover vara realtid.** En sammanfattning i slutet ar inte tillracklig - du behover veta *nar det hander* sa du kan reagera.
