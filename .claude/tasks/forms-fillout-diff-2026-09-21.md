# Formulär: hubben mot Fillout-originalen (genomgång 2026-09-21)

Alla 12 publicerade formulär i hubben jämförda fält för fält mot sina Fillout-förlagor.
Fillouts publika `__NEXT_DATA__` på `forms.swedishbalance.se/t/<id>` svarar fortfarande
(kontot har kvar `PAYING_ORG`), så originalen gick att läsa i sin helhet.

Hubben: happysleep (SE+DK × kontakt/retur/angerratt), hydro13 (kontakt/retur/garanti/
angerratt/progressbild/samtycke).
Fillout-ID: SE kontakt `4C5CfWni9Gus`, SE retur `brAmGUVG1sus`, SE ångerrätt `2NeEZQU9dous`,
SE kollagengaranti `9F7H4Zyfk3us`, SE feedback `2j5Y5QTgbLus`, DK kontakt `cCndUUcxoHus`,
DK retur `4miJZsnPyeus`, DK ångerrätt `eeU1WvFZv7us`, NO kontakt `hRzSf12FGmus`,
FI kontakt `byNeMfSY2Eus`, UGC `8MXyZQqC3zus`, nacksmärta-quiz `bCUbYQhrHzus`,
Envana kontakt `sGzzB93KySus`, Envana retur `8LDBopbL8hus`, Envana garanti `pUeiRy7d8Lus`.

---

## 1. Norska marknaden får svenska formulär

`/no-no/` är en live marknad (även `/sv-no/`). Alla tre formulärsidorna där laddar
`data-market="se"`:

| Sida | Laddar |
|---|---|
| `/no-no/pages/kontakt` | happysleep/kontakt/**se** |
| `/no-no/pages/returformular` | happysleep/retur/**se** |
| `/no-no/pages/angra-kop` | happysleep/angerratt/**se** |

Sidramen är norsk ("Returskjema", "Kontakt oss") via Shopify Markets-översättningen,
själva formuläret är svenskt.

Det är INTE en regression från migreringen. Det norska Fillout-formuläret
`hRzSf12FGmus` ligger kvar i `templates/page.contact.context.norway.json`, men den
mallen används inte av någon sida (kontaktsidan kör suffixet `kontakta-oss`, som
aldrig fick en norsk override). Norska kunder fick svenska formulär redan på
Fillout-tiden. Norskt retur- och ångerrättsformulär har aldrig funnits.

FI-marknaden är borttagen (`/fi-fi/` ger 404), så `byNeMfSY2Eus` kan skrotas.

## 2. Danska formulär: runtime-texterna är svenska

Embedden `public/forms-embed/v1.js` och forms-API:et har hårdkodad svensk text som
renderas oavsett marknad. Uppmätt live på prod 2026-09-21:

- DK ångerrätt: **"Steg 1 av 2"**, **"Tillbaka"**, **"Besked (valgfrit) (valfritt)"**
  (dubbel frivillig-markering, en dansk från etiketten och en svensk från runtimen),
  och **"Det här fältet är obligatoriskt."** på varje tomt fält.
- DK retur: **"Välj ett alternativ"** i antal-dropdownen (selects utan egen
  `placeholder` faller tillbaka på den svenska), **"(valfritt)"**.

Fullständig lista hårdkodad svenska:

`v1.js`: `Tillbaka` (703, + aria-label 827), `Steg X av Y` (742), `Stäng` (890),
` (valfritt)` (1065), `Fortsätt` (1119, fallback), `Lämna fältet tomt` (1141, honeypot),
`Skicka in` (1157, fallback), `Välj ett alternativ` (1213), `Välj en bild` (1316),
`Tryck här för att ta en ny bild...` (1317), `Ser den bra ut?` (1349/1364),
`Ta om` / `Ta om bilden` (1372/1374), `Det här fältet är obligatoriskt.` (1569),
`Ange en giltig e-postadress.` (1571), `Skickar...` (1658),
`Något gick fel. Försök igen.` (1683), `Något gick fel. Kontrollera din uppkoppling...`
(1690), `Laddar formulär...` (1772), `Formuläret kunde inte laddas just nu...` (1840).

`api/forms/submit` + `api/forms/upload`: `Ogiltig förfrågan`, `Ofullständig förfrågan`,
`Okänt formulär`, `Obligatoriska fält saknas: ...`, `För många försök...`,
`Kunde inte verifiera att du är människa...`, `Filen är för stor (max 25 MB)`,
`Filtypen stöds inte...`, `Uppladdningen misslyckades...`, `Något gick fel...`.

Fix: en strängtabell per marknad i configen eller i embedden, med svenska som fallback.
Servertexterna behöver marknaden med i svaret (den finns redan i requesten).

## 3. Kollagengarantin på SwedishBalance är aldrig migrerad

`/pages/hydro13-claim` (mall `page.hydro13-ansokan-om-garant.json`) laddar fortfarande
Fillout `9F7H4Zyfk3us` på SE, DK och NO. 20 fält. Den dör när Fillout-abonnemanget löper ut.

Formuläret är i princip identiskt med Envanas `hydro13/garanti/se`, med tre skillnader:
- prenumerationsfrågan har TRE svar (Nej / Ja, men den är pausad/avslutad / Ja, den är
  fortfarande aktiv) mot Envanas två
- portallänken går till `swedishbalance.se/apps/subscriptions`
- avsändaradress `kundservice@swedishbalance.se`, produktnamnet "Hydro13"

## 4. Envanas garantiformulär: flervalsfrågorna blev enval

| Fråga | Fillout | Hubben |
|---|---|---|
| Vad var ditt mål med...? | Checkboxes (flerval, frivillig) | radio (enval, **obligatorisk**) |
| Varför vill du utnyttja garantin? | Checkboxes (flerval, frivillig) | radio (enval, **obligatorisk**) |
| Har du en aktiv prenumeration? | frivillig | **obligatorisk** |

Orsak: `src/types/forms.ts` har ingen flervalstyp alls. `checkbox` är en enda
bekräftelseruta, `select`/`radio` är enval. En kund som både såg för lite resultat OCH
tyckte det var svårt att ta konsekvent kan bara ange ett av dem.

## 5. Bild vid reklamation är inte längre obligatorisk (SE + DK retur)

Fillout: `FileUpload` med `required: true`, villkorad på reklamation / fel produkt.
Hubben: `attachment` utan `required`.

Info-rutan säger fortfarande "För att vi ska kunna hjälpa dig behöver du bifoga en
bild/video som visar skadan/felet", men ingenting hindrar inskickning. Reklamationer
kommer in utan bevis och kräver en extra runda.

## 6. Introtexterna saknas på SwedishBalances kontakt- och returformulär

Alla fyra (kontakt SE/DK, retur SE/DK) har `intro: null`. Envanas formulär har sina.
Det är `scripts/seed-sb-forms.ts` som hoppade över dem.

Saknad text:
- kontakt SE: "Vad roligt att du vill prata med oss! Fyll i formuläret så svarar vi dig så snabbt vi kan."
- kontakt DK: "Vi er glade for, at du vil tale med os! Udfyld formularen, så vender vi tilbage til dig, så snart vi kan."
- retur SE: "För att vara berättigad till retur måste varan vara i samma skick..." + "Använd den returadress som anges i returinstruktionerna... **[länk till returpolicyn]**"
- retur DK: motsvarande två stycken, inkl. länken till `/da-dk/pages/returpolicy`

Länkarna till returpolicyn försvann alltså helt ur returformulären.

## 7. Ordernummer blev obligatoriskt på kontaktformulären

Fillout SE/DK/NO kontakt: `required: false`. Hubben SE/DK: obligatoriskt.
En kund som inte hittar sitt ordernummer kommer inte förbi.

Envana gick åt motsatt håll: Fillout krävde det (`aR14`, required), hubben har det
frivilligt. Inkonsekvent mellan butikerna.

## 8. Godkännandetexten i returformulären är omskriven

| | Fillout | Hubben |
|---|---|---|
| SE | "Som kund godkänner du att du står för returfrakten och att returen skickas med ett sändningsnummer" | "Jag har läst och godkänner villkoren för retur." |
| DK | "Som kunde accepterer du, at du er ansvarlig for returforsendelsen, og at returneringen sendes med et sporingsnummer." | "Jeg har læst og accepterer betingelserne for returnering." |

Originalet är kundens uttryckliga godkännande av att den betalar returfrakten. Nu
godkänner kunden "villkoren" utan att villkoren står någonstans i formuläret (och
länken till returpolicyn är borta enligt punkt 6).

## 9. Tre Fillout-beroenden till i SwedishBalances tema

Svep av alla 566 tema-filer:

| Fil | Fillout-ID | Status |
|---|---|---|
| `templates/page.hydro13-ansokan-om-garant.json` | `9F7H4Zyfk3us` | **LIVE** `/pages/hydro13-claim` (punkt 3) |
| `templates/page.recension-happysleep.json` | `8MXyZQqC3zus` | **LIVE** `/pages/din-happysleep-resa` (UGC-insamling, gåva mot bild/video) |
| `templates/page.quiz-page.json` | `bCUbYQhrHzus` | **LIVE** `/pages/somn-quiz` (nacksmärta-quiz) |
| `templates/page.contact.json` + `.context.denmark.json` + `.context.norway.json` | `4C5CfWni9Gus`, `cCndUUcxoHus`, `hRzSf12FGmus` | döda mallar, ingen sida använder suffixet `contact` |

SE feedback `2j5Y5QTgbLus` finns i Fillout men är inte inbäddad någonstans i temat -
troligen länkad från mejl.

Envana är rent: alla fem sidorna (`kontakt`, `returformular`, `garantiformular`,
`angerratt`, `garanti`) kör hubben, noll Fillout.

## 10. Småsaker

- **Envana retur, antal flaskor:** Fillout 1-6, hubben 1 / 2 / 3 / "Fler än 3".
- **DK retur:** klimatsmart-rutan och "Vælg mulighed" visas alltid. I Fillout dök de
  upp först när kunden bockat godkännandet. (SE gömmer dem för kollagen, vilket stämmer.)
- **Envana ångerrätt:** taggen är `angerratt`, SwedishBalances är `anger`. En
  Freshdesk-regel som lyssnar på `anger` missar Envana. Bekräftelsesteget saknar
  dessutom interpolationen av ordernummer och e-post som SB:s har.
- **Envana kontakt, ämnet "Retur och ångerrätt":** visar både hänvisningen OCH hela
  formuläret. Fillout gömde fälten så kunden bara fick hänvisningen.
- **Envana kontakt:** placeholders tappade ("Ex. R1001", "Din e-postadress",
  "Berätta hur vi kan hjälpa dig").
- **`page.contact.json`-familjen** kan raderas ur temat.

---

## Det som skiljer sig med flit och är rätt

- **DK retur + DK kontakt:** Fillouts villkor var skrivna mot de SVENSKA svarssträngarna
  medan alternativen är danska, så reklamationsrutan och bilduppladdningen visades
  aldrig för danska kunder. Omkopplat i hubben.
- **SE retur:** Fillout hade en "AVBRYTA ORDER"-ruta vars villkor pekade på ett
  svarsalternativ som inte fanns i listan. Hubben lade till alternativet.
- **Ingen dateGate på SwedishBalances retur** - Fillout hade ingen, så en gate hade
  tyst ändrat policy.
- **Envana:** länkar bytta get-renew.com -> shopenvana.com, produktnamn "Collagen Formula".
- **Ångerrätten** är tvåstegs med egen bekräftelseknapp i båda butikerna, prio 3,
  ingen dateGate. Stämmer med originalen och med lagkravet.
- **progressbild** och **samtycke** (Envana) är nya, har ingen Fillout-förlaga.

---

# Del 2: visuellt svep (2026-09-21)

Alla 14 live formulärsidor renderade i Chrome på 1100, 390 och 375 px och tittade på
som kontaktark. Del 1 jämförde configen; det här är vad kunden faktiskt ser.

## 11. Dubbel frivillig-markering, även på svenska

Runtimen lägger själv till " (valfritt)" efter etiketten på icke-obligatoriska fält.
Sex fält har redan ordet i sin egen etikett och får det alltså två gånger:

| Formulär | Renderas som |
|---|---|
| happysleep/angerratt/se | **Meddelande (valfritt) (valfritt)** |
| happysleep/angerratt/dk | **Besked (valgfrit) (valfritt)** |
| happysleep/kontakt/se | **Ladda upp bild (frivilligt) (valfritt)** |
| happysleep/kontakt/dk | **Upload billede (valgfrit) (valfritt)** |
| hydro13/angerratt/se | **Meddelande (valfritt) (valfritt)** |
| hydro13/kontakt/se | **Ladda upp bild (frivilligt) (valfritt)** |

Verifierat i webbläsaren på prod. Fix: ta bort parentesen ur de sex etiketterna
(runtimen sköter markeringen), eller hoppa över runtimens tillägg när etiketten redan
slutar på en parentes.

## 12. Sidans egen rubrik: danska visar svenska, norska visar norska

Rubriken ovanför formuläret kommer INTE från hubben utan från temats
`section-text`-block, och de översätts på två olika sätt som inte är i synk:

| Sida | `<title>` | Rubrik på sidan |
|---|---|---|
| SE retur | Returformulär | Returformulär |
| **DK retur** | Returformular | **Returformulär** (svensk) |
| NO retur | Returskjema | Returskjema |
| SE kontakt | Kontakta oss | Kontakta oss |
| DK kontakt | Kontakt os | Kontakt os |
| **NO kontakt** | Kontakt oss | **Kontakta oss** (svensk) |
| SE/**DK**/**NO** ångerrätt | **Ångra köp** på alla tre | från hubbens `config.title`, rätt på SE+DK, svensk på NO |

Mätt i Shopifys översättningslager (`translatableResources`,
`ONLINE_STORE_THEME_JSON_TEMPLATE`):

| Mall | saknade `da` | saknade `no` |
|---|---|---|
| `page.returformular.json` | **34 av 34** | 0 av 34 |
| `page.kontakta-oss.json` | **129 av 129** | **129 av 129** |

DK-kontaktens rubrik räddas av att `page.kontakta-oss.context.denmark.json` hårdkodar
"Kontakt os". Returformuläret har ingen sådan override, därför svensk rubrik.
Norska returformuläret har full Translate & Adapt-översättning, därför norsk rubrik.
Spegelvänt problem: **NO har sidan översatt men formuläret svenskt, DK har formuläret
översatt men sidan svensk.**

## 13. Hela FAQ-blocket under kontaktformuläret är svenskt på DK och NO

`/da-dk/pages/kontakt` och `/no-no/pages/kontakt` visar under formuläret:
"Vanliga frågor", "Beställningar och leveranser", "Returer och byten", "Betalningar och
fakturering", "Garanti och reklamation", "Konto och kundservice" plus alla frågor och
svar i dragspelen. 129 av 129 strängar saknar översättning på båda språken.

Det är den största sammanhängande svenska texten en dansk eller norsk kund möter.

## 14. Fotens "Hantera prenumeration" är svensk på alla marknader

Övriga fotlänkar är översatta (DK: Kundeservice, Forsendelse og levering,
Returneringer og reklamationer, Fortrydelsesret...). Två undantag:
- **"Hantera prenumeration"** svensk på SE, DK OCH NO
- **"Ångra köp (ångerrätt)"** svensk på NO (DK har "Fortrydelsesret")

## 15. `<title>` för ångerrättssidan är svensk på DK och NO

"Ångra köp – SwedishBalance" i webbläsarfliken på alla tre marknader. Rubriken på
sidan är rätt på DK ("Fortryd dit køb") eftersom den kommer från hubben, så det är
bara fliken och sökresultatet som är fel.

## 16. Envanas formulärsidor saknar rubrik helt

`shopenvana.com/pages/{kontakt,returformular,garantiformular}` har ingen rubrik alls -
sidan börjar direkt i brödtext. Ångerrätten har en ("Ångra ditt köp") eftersom det
formuläret har `config.title` satt. SwedishBalance har stora rubriker på alla sina.

Fix: sätt `config.title` på Envanas tre formulär (samma mekanism som ångerrätten
redan använder).

Kontaktsidan ser dessutom nästan tom ut innan man väljer ämne: rubrik saknas, fälten
är dolda, och foten börjar direkt under dropdownen.

## 17. Rabattpopup ovanpå ångerrättsformuläret

`/pages/angra-kop` öppnar HappySleeps "Du har fått en **Hemlig rabatt!**"-popup
ovanpå det lagstadgade ångerrättsformuläret. En kund som är där för att frånträda sitt
köp möter ett rabatterbjudande. Popupen är inte kopplad till hubben.

## 18. Mätt, inte tittat: mobilen är ren

375 och 390 px, alla 14 sidor: **noll sidledsscroll**, inga element utanför skärmen
(honeypoten ligger på -9999 px med flit) och inga tryckytor under 44 px på knappar,
inputs eller radioalternativ. Fältetiketterna är 25 px höga, men de är text och inte
tryckytor.

## 19. Obligatoriska fält är omärkta

Hubben markerar frivilliga fält ("(valfritt)") men aldrig obligatoriska. På
SwedishBalances kontaktformulär är ordernummer numera obligatoriskt (punkt 7) utan att
det syns; kunden får veta det först vid "Det här fältet är obligatoriskt."

---

# Del 3: vad som åtgärdades (2026-09-21, commit e6a40dd9)

## Klart och verifierat live

| Punkt | Åtgärd |
|---|---|
| 1 | Tre norska formulär byggda + kontext-mallar. **Marknadens handle är `norge`, inte `norway`** - den gamla `page.contact.context.norway.json` har därför aldrig varit aktiv |
| 2 | Språktabell per marknad i `forms-embed/v1.js` + `src/lib/form-i18n.ts` för serverns svar. Orden ur butikens egna `locales/da.json` och `locales/no.json` |
| 3 | `happysleep/garanti/se` byggt, `/pages/hydro13-claim` pekar på hubben, noll Fillout |
| 4 | Ny fälttyp `checkboxes`. Väntar på deploy, se nedan |
| 5 | `attachment` obligatorisk igen på SE + DK retur |
| 6 | Introtexterna och returpolicy-länkarna tillbaka på alla fyra SB-formulär |
| 7 | Ordernummer frivilligt igen på SB:s kontaktformulär |
| 8 | Godkännandetexten tillbaka till Fillouts ordalydelse |
| 9 | Fillout-embedden ur de tre döda `page.contact`-mallarna (filerna finns kvar) |
| 10 | Envana: 1-6 flaskor, taggen `anger`, bekräftelsesteget visar order och e-post, placeholders tillbaka |
| 11 | Dubbla frivillig-markeringen borta på sex fält i fem formulär |
| 12 | DK returformulärets rubrik -> "Returformular", NO -> "Returskjema" och "Kontakt oss" |
| 16 | `config.title` på Envanas formulär. NO fick INGEN title - SB:s sidor bär rubriken i temat och den blev dubbel |
| 18 | Mätt om: noll sidledsscroll på 375/390 |
| 19 | Löst genom punkt 7 - inga omärkta obligatoriska fält kvar där kunden kan gissa fel |
| - | Hälsokollen bevakar de fyra nya sidorna. Slug utan **mätt** tystnadströskel hoppas över i stället för att räkna på `undefined` |

Slutkontroll: `regress-forms` grönt på alla 16 formulär, och alla 14 butikssidor
mätta på 1100 och 390 px - rätt marknad, rätt rubrik, noll Fillout, noll
sidledsscroll.

## Väntar på deploy

`--flerval` på `scripts/fix-forms-2026-09-21.ts` sätter `kind: "checkboxes"` på
garantiformulärens två frågor. Configen får inte gå före koden: den embed som
ligger ute renderar okända fälttyper som ett fritextfält. Kör flaggan när nya
`v1.js` är live.

## Blockerat på andras åtgärd

1. **`write_translations` saknas på Shopify-appen** (den har `read_translations`).
   Blockerar tre saker: FAQ-blocket under kontaktformuläret på DK och NO
   (163 strängar), `<title>` "Ångra köp" på DK och NO, och fotens "Hantera
   prenumeration". Samma mönster som `write_content` i september: scope + ominstallation,
   och **minta ny token efteråt**.
2. **Rabattpopupen på ångerrättssidan är Alia** (`alia-root-313411`), inte Klaviyo
   och inte temat. Uteslutningen sätts i Alias egen sidmålstyrning.
3. **UGC-formuläret** (`8MXyZQqC3zus` på `/pages/din-happysleep-resa`) och
   **nacksmärta-quizet** (`bCUbYQhrHzus` på `/pages/somn-quiz`) ligger kvar på
   Fillout. Ingetdera är ett supportformulär - quizet hör snarare hemma i
   `runtime/quiz-runtime`. Egna bygg, egna beslut.
