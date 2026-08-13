# Session: 2026-08-13 - kedjan för reels, hookramverket och kvarhållningen

Allt arbete ligger i `izabella-v2`, committat till `b466192`. Content-hub orört (tre otrackade filer sedan tidigare, ingen build körd - inget rördes där).

## Det viktigaste nästa agent behöver veta

**Kvarhållningen är det som stryper räckvidden, inte kvaliteten.** Snitt-tid per post, uppmätt idag för första gången:

| datum | views | reach | snitt-tid |
|---|---|---|---|
| 08-08 | 296 | 202 | 5,4s |
| 08-09 | 197 | 137 | 4,6s |
| 08-09 | 138 | 128 | 8,8s |
| 08-11 | 12 | 10 | 6,6s |
| 08-12 keto | 21 | 18 | **1,9s** |

`REEL_METRICS` har begärt `ig_reels_avg_watch_time` från API:t sedan dag ett, men `iz_results` saknade kolumn - svaret lästes och slängdes. Frågan "varför får vi så få views" gick därför inte att besvara med data. Kolumnerna finns nu (`avg_watch_time`, `total_watch_time`).

Följden: **hela dagens arbete med bild-mot-ord är osynligt för någon som lämnar efter två sekunder.** Det gör videon rätt, men det var inte flaskhalsen.

## BRÅDSKANDE: sockervideon i kön

`iz_queue` 2026-08-14 pekar på en uppladdad fil med den **gamla** öppningen ("You think sugar is sugar..."). Manuset är omskrivet i `scratchpad/draft-33684506.json` ("Sugar is not sugar. Soda, juice, bread...") och rösten genererades via Higgsfield, men **bygget hanns aldrig köras**. Görs det inte före 11:00 går den svaga hooken ut.

Kommandot är samma som för de andra: `--phase build --draft scratchpad/draft-33684506.json --voice <ny wav> --work scratchpad --dry-run`, sedan `scratchpad/queue_it.py 33684506`.

## Hookramverket (docs/HOOK-FRAMEWORK.md)

Byggt ur korpusen, **Copycoders "Advanced Hook Training"** (`../Obsidian/Vault/raw/videos/2026-05-15-copycoders-aicsa-expert-suite-advanced-hook-training.md`) och Cattonis formelbank. Motorn är Lukes fyra delar: **reference → pattern → emotion → payoff**. En reference är en tro tittaren redan bär; du bryter den eller bekräftar den. Utan reference har hooken inget att trycka emot.

Fyra grindar bär ramverket, och **varje enskild fångade befintliga fel**:

1. Första meningen är påståendet, max tio ord - underkände **alla tre manus vi skrivit**
2. Minst tre bilder i de första nio orden - underkände båda omskrivningarna
3. Hook-bilden ska vara fel-ser-ut, inte dokumentär
4. Aldrig beskriva vad händerna gör - modellen kan inte rita dem

## Mönstret som kostade mest tid

**Prompten ändrad i ena änden, kritikern i den andra.** Två gånger samma dag:

- Kritikerns prompt bad om "a plate being pushed away" som hook, alltså en handrörelse - fyra underkända hookar i rad på "severely malformed hands", videon utan öppningsbild och miniatyr
- Kritikerns hook-regel förbjöd "a clock, gadget or visual pun" och slog bort exakt den fel-ser-ut-bild manusprompten just instruerats att skapa

Kritikern har en egen kopia av hook-reglerna. De går isär tyst, precis som de duplicerade tidskonstanterna gjorde - fast i prompttext i stället för i tal.

## Facebook - halvklart, exakt läge

Sidan **finns** sedan dag noll (`HEALTH-HANDOVER.md:180`). Att content-hubs systemanvändare inte ser den är isoleringen som fungerar, inte en saknad sida - det misstaget kostade en rond.

Gjort:
- `tools/fb.py` - trestegsflödet mot `/{page-id}/video_reels` med `file_url`, sidtoken hämtas en gång via `/me/accounts` och cachas
- `publish_facebook` i autopilot, best effort, hoppar tyst över utan `FB_USER_TOKEN`
- Kolumnen `fb_video_id` i `iz_queue`
- Appen saknade hela use caset för sidhantering. **"Manage everything on your Page" tillagt** - först då dök kategorin "Events Groups Pages" upp i Explorer

Blockerat, verifierat med `/debug_token`:
- Token giltig, scopes = `pages_show_list` + `public_profile`. **`pages_manage_posts` saknas** - fältet i Explorer vägrade committa den trots tre försök
- granular pages_show_list → ett mål: `1271429386052523`. Det id:t svarar **400 som sid-id**, och `/me/accounts` är **tomt**
- `/me/businesses` och `owned_pages` svarar 400 (kräver `business_management`)

Tolkningen: sidan administreras via en **business-portfölj**, inte som personlig sidroll. Nästa agent ska **läsa Metas dokumentation** för hur en Business-login-app når en portföljägd sida innan något klickas - vi brände fyra godkännanderundor på gissningar.

## Övrigt gjort

- **Gemini File API som steg 5c** (`tools/vox_gemini_audit.py`): hela videon med ljud, egen fråga. Content-hub har hela tiden analyserat video med ljud via `callGeminiVideo`; anteckningen om att "Kie släpper ljud" gällde en ren ljudfil genom en annan endpoint. Utbyte över fyra körningar: fem äkta fynd, lika mycket brus. **Kravd kritik är hela skillnaden** - öppen fråga gav "excellent, absolutely nothing is unclear"
- **Halvtonsgolvet raderar inte längre en bild** - hela motivklasser (folkmassor, metall, glas) renderas alltid fotografiskt; tre beats ströks mitt i ett bygge och gav 2,5s tom video. Koden lägger på punktskärmen i stället
- **Metas safe zone** (topp 14%, botten 35%): slutkortet flyttat från 19% till 39,6% från botten, förlängt 2,6 → 4,2s. Delningsraden är ett **eget kort** med tuschikon, 3,4s
- **Captionen släcks aldrig** av ett sifferkort ("vissa tittar utan ljud"), men upprepar inte kortets ord
- **Klockslag = siffra + AM/PM**, grindat. Regeln var överenskommen men fanns ingenstans, så "STOP EATING AT THREE" gick ut i en miniatyr
- **Miniatyrens cachenyckel bar inte rubriken** trots att rubriken är inbakad i bilden - bygget rapporterade cacheträff medan gammal text låg kvar
- **`vox_timing.py`** - alla sluttider på ett ställe efter att speglingen gått isär tre gånger. `video_seconds()` var ett fjärde ställe: concept-raden köade en 39,5s-video som 34,3s
- **Repareringen byter bara på BEKRÄFTADE fel** - den bytte mannen-med-levern mot ett friliggande organ på ett obekräftat påstående
- **Svepet hämtar interventionsförsök med PMC-fulltext.** PubMeds "free full text" duger inte: brödstudien ligger i den listan och är ändå betalvägg. Frågorna gick från två till fem per pillar, valda på vardagsföremål

## Blockerat / öppna frågor

- **Facebook** enligt ovan
- **YouTube** är private tills API-projektet klarat compliance-auditen. Inte en inställning - overifierade projekt får varje uppladdning låst
- **Ord-captionsen ligger 18-19% från botten**, alltså i Metas täckta band. Att flytta dem är en ombyggnad av geometrin, inte en konstant. William har inte sagt till
- **Kritikern och täthetsgrinden drar åt olika håll** - kritikern släpper bilder, golvet kräver ett antal, och två byggen föll på det. Kritikern borde ersätta i stället för att släppa när bortfallet bryter golvet
- **`seen_but_not_said`** i Gemini-prompten har aldrig gett en sann träff, bör strykas
- **`second-helping`** har en missbildad hand vid närbild

## Nästa steg, i prioritetsordning

1. **Bygg om sockervideon** före 11:00 imorgon
2. Läs Metas dokumentation för portföljägda sidor, fixa Facebook klart
3. Mät om hookarna bet: snitt-tiden på 08-14 och 08-15 mot dagens 1,9-8,8s
4. William underkände vinäger-och-bröd som ämne: *"vem fan bryr sig"*. Skicka-testet ska köras på **studien**, före manuset - kan jag inte namnge vem som skickar den vidare ska den inte bli video
