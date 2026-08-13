// Onsjö 415A - annonskoncept för Meta (2026-08-13).
//
// Kringgår hook-kollisionen i generateVettedConcepts UTAN att röra den delade pipelinen:
// generateHooks körs en gång per anrop, så count:1 per vinkel ger varje koncept en EGEN
// hook-batch. Dessutom ackumuleras varje använd hook till en explicit hookBan för resten av
// körningen, så vinkel 6 vet vad vinkel 1-5 redan tagit. Mönster från genesis-matrix-refill.ts.
//
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-annonskoncept.ts

import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateVettedConcepts } from "../src/lib/genesis-pipeline";
import { judgeCopy, deterministicChecks, type JudgeIssue, type JudgeResult } from "../src/lib/creative-judge";
import type { Angle, AwarenessLevel, ConceptProposal } from "../src/types";

const WORKSPACE_ID = "59ab7d80-3fb8-40a0-920e-cce602d79137";
const PRODUCT = "onsjo-415a";
const BATCH_TAG = "onsjo-annons-2026-08-13";
const LANGUAGE = "Swedish";

// ---------------------------------------------------------------------------
// HÅRDA REGLER. Allt här är verifierat mot underlaget eller är en uttrycklig
// projektregel. Bottarna får inte gå utanför det.
// ---------------------------------------------------------------------------
const REGLER = `HÅRDA REGLER FÖR DEN HÄR ANNONSEN (bryt aldrig mot dem):

1. FORMATET ÄR EN FACEBOOK-ANNONS. Skriv aldrig "det här mailet", "det här brevet" eller
   "svara på det här". Det är en annons i ett flöde, inte ett utskick.

2. INGA PRISER, INGA VALUTASIFFROR, INGA DRIFTKOSTNADER. Skriv aldrig ut kronor, kr, SEK
   eller en summa av något slag. Priset står på landningssidan, inte i annonsen.

3. INGA INTÄKTSPÅSTÅENDEN. Skriv aldrig att fastigheten genererar intäkter, betalar för sig
   själv, ger avkastning, ger passiv inkomst eller går på autopilot. Skriv aldrig vad en
   köpare skulle kunna tjäna. Detta är den hårdaste regeln i projektet. Du får skriva att
   Marie och Stefan drev verksamhet där, för det är ett faktum om det förflutna, men aldrig
   ett löfte om framtiden.

4. HITTA INTE PÅ SIFFROR. Inga beläggningsgrader, inga gästantal, inga årsomsättningar,
   inga årtal utöver de som står i underlaget. Om du behöver en siffra, använd bara de
   som står nedan.

5. FÖRUTSÄTT INGENTING OM LÄSAREN. Läsaren vet inte att hen är på marknaden. Skriv aldrig
   som om hen letar fastighet, redan driver eget företag, är i en viss ålder eller har en
   viss familjesituation. Slå aldrig fast läsarens ålder ("du var 40 igår").

6. ANNONSEN FÅR INTE SE UT SOM EN BOSTADSANNONS. Ingen kvadratmeterlista, ingen mäklarton,
   inget "till salu" som första intryck. Läsaren filtrerar bort bostadsannonser på reflex.

7. SVENSKA SOM ÄR SKRIVEN AV EN SVENSK. Inga engelska ord, inga anglicismer, inga
   översättningsklichéer. Bara vanliga bindestreck, aldrig långa tankestreck.

8. SÄLJAREN är Stefan. Han och hans fru Marie äger stället. Skriv aldrig i en mäklares roll.

9. RÖSTEN ÄR STEFANS EGEN. Annonsen publiceras från Facebook-sidan "Stefan Hedin" och
   artikeln den leder till är signerad "Av Stefan". Skriv alltså som Stefan: "jag", "vi",
   "min fru Marie", "vi byggde", "nu säljer vi". Skriv ALDRIG om Stefan och Marie i tredje
   person ("ett par vid namn Stefan och Marie"), och hitta aldrig på en annan berättare som
   upptäckte stället. Läsaren ser Stefans namn som avsändare, så en främmande berättarröst
   gör annonsen obegriplig.

10. HITTA INTE PÅ MÄNNISKOR. Inga påhittade personer, inga uppdiktade par med namn, inga
    påstådda kunder eller grannar, ingen påhittad scen ur läsarens liv presenterad som något
    som hänt. De enda personer som finns är Stefan, Marie, läkaren som bodde där, personalen
    och gästerna. Du får beskriva en känsla läsaren kan känna igen, men aldrig påstå att en
    namngiven människa gjorde något.

11. SKRIV INTE ATT DU INTE SÄLJER. Meningar som "inte för att du ska köpa något" är osanna,
    det här är en annons för en fastighet som är till salu. Var lågmäld i stället för att
    förneka syftet.

12. NÄR OMDÖMENA NÄMNS, ANVÄND SIFFRORNA. Skriv 8,9 av 10 på Booking, 4,7 av 5 på Google
    eller 4,6 av 5 på Tripadvisor, aldrig "toppbetyg överallt".

13. LÄSAREN KAN VARA ENSAM. Skriv aldrig "du och din partner", "ni två" eller något annat
    som förutsätter att läsaren lever med någon. Skriv "du".`;

const FAKTA = `VERIFIERADE FAKTA (använd bara dessa, lägg aldrig till egna):

Platsen: en tomt på 2 888 kvm utanför Halmstad, högt belägen med vid utsikt över Halland.
Två separata byggnader på samma tomt med en innergård emellan.

Byggnad 1, bostadshuset: byggt 1963, 163 kvm entréplan och 153 kvm souterrängplan med egen
entré. Kök renoverat 2015. Kaminen insatt 2024. Tre till fyra sovrum. Souterrängplanet har
använts till mottagning, undervisningsrum, kontor och boende. Huset kallas lokalt Gamle
Doktorns Hus, för en läkare bodde och tog emot patienter där i decennier. Han åkte aldrig
till jobbet. Han gick nedför en trappa.

Byggnad 2: byggd 2018 av Stefan själv, 280 kvm, sju rum som alla har eget badrum och egen
dörr ut. Öppet kök mot en lounge. En hall som fungerade som reception.

Historien: Marie tränade hundar hela sitt yrkesliv, först tjänstehundar åt polis och tull,
sedan blev hon en av Nordens främsta på att träna vägglushundar. Hundförare kom från hela
världen till hennes kurser. Problemet var att kursdeltagarna sov utspridda på hotell, och
det är svårt att hitta boende där hunden är lika välkommen som föraren. Så hon frågade
Stefan: "Kan inte du bygga en kursgård?" Den frågan startade allt.

Det som började som en kursgård blev ett hotell med gäster från hela världen. INGEN AV DEM
HADE JOBBAT PÅ HOTELL EN ENDA DAG. Stefan lagade maten för att han tycker om att laga mat.
Betygen blev 8,9 av 10 på Booking, 4,7 av 5 på Google och 4,6 av 5 på Tripadvisor.
En äkta recension, ordagrant: "Ett så fint välkomnande är man inte van vid."

De anställde personal som skötte det dagliga, rummen, städningen och frukosten. Därför tog
det aldrig över deras liv. Den andra anledningen är att gästerna sov i en annan byggnad än
ägarna. Man går över en innergård och stänger en dörr efter sig.

En känd sångerska bodde där en kväll. Hon kom in i loungen för ett glas vin, någon började
prata, någon skrattade, och en vanlig kväll blev en fest. Främlingar som aldrig träffats satt
kvar till fyra på morgonen. Artister, politiker och företagare bokade just för att slippa de
stora hotellen.

De säljer för att det de tycker mest om är att bygga något nytt. De har tillbringat mer och
mer tid vid Medelhavet och vill göra om det där. Inget gick sönder, verksamheten misslyckades
inte, de tröttnade inte på gästerna.

Byggnaden måste inte bli ett hotell. Den passar för kursgård, retreat, mathelger, bröllop med
boende, konferens, kontor med behandlings- eller undervisningsrum, korttidsuthyrning eller
generationsboende.

Marken och bostadshuset ägs privat. Verksamhetsbyggnaden ligger i ett aktiebolag och står på
ofri grund, så en köpare kan antingen ta över bolaget eller köpa byggnaden av det. Detta är
en detalj för samtalet, inte för annonsen.`;

const MALET = `VAD ANNONSEN SKA GÖRA: få läsaren att klicka sig in på en artikel om stället.
Den ska inte sälja fastigheten. Den ska öppna en loop som bara artikeln stänger. Sluta med en
mjuk uppmaning att läsa hela historien, aldrig med "boka visning" eller "kontakta oss".`;

// ---------------------------------------------------------------------------
// Hook-ban. Ackumuleras genom körningen.
// ---------------------------------------------------------------------------

// Redan använt i körning 1 och 2 (2026-08-13), får inte upprepas.
const REDAN_ANVANT = [
  "Marie hade aldrig jobbat på hotell en enda dag i sitt liv",
  "Marie och Stefan hade noll hotellerfarenhet när de byggde",
  "drömmen lagts i en låda. Inte övergiven. Bara gömd",
  "Du var 40 igår. Du är 47 idag",
  "Mikael blev tyst vid middagsbordet när kompisen berättade",
  "Han kallades Gamle Doktorn för att han bodde och jobbade i samma hus",
];

/**
 * Egen bedömning i stället för pipelinens.
 *
 * Skälet: rubrikdomaren får produktnamnet och fällde koncept 5 med
 * `block/critical_mismatch: "entire ad copy"` för att copyn aldrig nämner "Onsjö 415A".
 * Att inte nämna objektet ÄR strategin här, läsaren vet inte att hen är på marknaden och
 * filtrerar bort bostadsannonser på reflex. Samma domare bad tidigare om MER intäktsbevis,
 * vilket projektets hårdaste regel förbjuder. Den kan alltså inte avgöra vad som är
 * publicerbart för det här objektet.
 *
 * Kvar gör den nytta som språk- och regelkontroll, så:
 *  - de deterministiska kontrollerna (pris, tankstreck, engelska ord) fäller fortfarande,
 *    och körs över rubriker och hooks precis som i pipelinen,
 *  - rubrikdomaren körs UTAN produktnamn, så den bedömer copyns kvalitet och inte om den
 *    säljer rätt sak, och dess block nedgraderas till varning.
 */
async function bedom(p: ConceptProposal): Promise<JudgeResult> {
  const ctx = { language: LANGUAGE };
  const rubrik = await judgeCopy(p.ad_copy_primary[0] || "", ctx);

  const issues: JudgeIssue[] = rubrik.issues.map((i) =>
    i.severity === "block" && i.type !== "price" && i.type !== "english-word" && i.type !== "dash"
      ? { ...i, severity: "warn" as const, type: `nedgraderad:${i.type}` }
      : i,
  );

  const sedd = (q?: string) => issues.some((e) => e.quote?.toLowerCase() === q?.toLowerCase());
  for (const rad of [...(p.ad_copy_headline ?? []), ...(p.cash_dna.hooks ?? [])]) {
    for (const iss of deterministicChecks(rad, ctx)) {
      if (!sedd(iss.quote)) issues.push(iss);
    }
  }

  const blocked = issues.some((i) => i.severity === "block");
  return {
    ...rubrik,
    issues,
    blocked,
    verdict: blocked ? "REJECT" : issues.length || rubrik.score < 6 ? "WARN" : "PASS",
  };
}

function hookBan(banned: string[]): string {
  if (!banned.length) return "";
  return [
    "HOOK-KRAV (ABSOLUT): den här körningen testar OLIKA öppningar. Följande är REDAN UPPTAGNA",
    "och får inte användas, parafraseras eller efterliknas i första meningen:",
    ...banned.map((b) => `- "${b}"`),
    "Välj en strukturellt annorlunda hook-typ än de bannade: en scen mitt i handlingen, ett",
    "citat, en fråga, ett kontraintuitivt påstående eller en specifik tidpunkt eller plats.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Vinklarna. En per drivkraft ur products.target_audience. Ett koncept i taget.
// ---------------------------------------------------------------------------

interface Vinkel {
  key: string;
  drivkraft: string;
  awareness: AwarenessLevel;
  angle: Angle;
}

const VINKLAR: Vinkel[] = [
  {
    key: "vilande-drommen",
    drivkraft: `DRIVKRAFT: den vilande drömmen. Nästan varje vuxen i Sverige har tänkt tanken: tänk om
vi bara gjorde något helt annat, någon annanstans. Den kommer på söndagskvällen, på pendeln,
på semestern när livet känns rätt en stund. Sedan läggs den undan, för den praktiska frågan
om vad man skulle leva på saknar svar. Drömmen är inte död, den står under tryck.
TON: bekräftande, aldrig hånande. Namnge tanken så läsaren känner igen sig, visa sedan att
den dör på en enda fråga, och antyd att den frågan har ett svar. Avslöja inte svaret.`,
    awareness: "Unaware",
    angle: "Story",
  },
  {
    key: "kategorin-finns-inte",
    drivkraft: `DRIVKRAFT: känslan av att livet man vill ha inte finns att köpa. Inte att man saknar mod
eller pengar, utan att själva saken, ett ställe byggt för att man ska kunna bo och försörja sig
på samma adress, inte existerar. Läsaren har aldrig satt ord på det eftersom hen aldrig sett
kategorin. I samma sekund den namnges är igenkänningen omedelbar.
TON: namnge kategorin. Förklara att den nästan aldrig byggs, för det tar år, och att de få
som har en inte säljer, för de bor i den. Det är därför läsaren aldrig sett en.`,
    awareness: "Problem Aware",
    angle: "Contrarian",
  },
  {
    key: "byggde-utan-att-kunna",
    drivkraft: `DRIVKRAFT: fascination för folk som byggt något på riktigt utan ritning. Stefan och Marie
är inte entreprenörer i startup-mening. De byggde för att Maries kursdeltagare behövde någonstans
att sova med hundarna. Att de inte hade en aning om vad de gjorde tar bort ursäkten om att det
skulle krävas särskild kunskap.
TON: berätta det som en händelse, inte som en merit. Början är Maries fråga till Stefan.
FÖRBJUDET: att låta som skryt. Berätta vad som hände, inte hur duktiga de var.`,
    awareness: "Unaware",
    angle: "Story",
  },
  {
    key: "delade-vardagen",
    drivkraft: `DRIVKRAFT: den delade vardagens utmattning. Inte livspusslet i abstrakt mening, utan det
specifika i att lämna hemmet varje morgon och komma tillbaka varje kväll och aldrig riktigt vara
på rätt ställe. Bilen, mörkt ute när man åker, mörkt ute när man kommer hem.
TON: konkret och fysisk. En scen, inte ett resonemang. Lägg sedan läkaren bredvid: han åkte
aldrig till jobbet, han gick nedför en trappa i samma hus.
FÖRBJUDET: att påstå att läsaren hatar sitt jobb. Det handlar om avståndet, inte om jobbet.`,
    awareness: "Problem Aware",
    angle: "Problem-Agitate",
  },
  {
    key: "ovanliga-manniskor",
    drivkraft: `DRIVKRAFT: nyfikenhet på hur ovanliga människor lever. Artister, politiker, hundförare från
hela världen, en sångerska som gjorde en vanlig kväll till en fest som höll till fyra på
morgonen. Skvallervara. Ska inte förklaras, ska hängas fram.
TON: berätta scenen och låt den vara. Poängen är inte fastigheten, poängen är att sådana
kvällar uppstår på vissa ställen och aldrig på andra.`,
    awareness: "Unaware",
    angle: "Curiosity",
  },
  {
    key: "godtyckliga-regler",
    drivkraft: `DRIVKRAFT: misstanken att reglerna för hur livet ska vara organiserat är mer godtyckliga än
de ser ut. Att uppdelningen mellan arbete och boende är en konvention, inte en nödvändighet.
Någon bestämde en gång att man ska bo på ett ställe och försörja sig på ett annat, och sedan
byggdes hela landet efter det.
TON: kontraintuitiv och lugn. Inte konspiratorisk, inte upprörd. Peka på att det var ett val
någon gjorde åt oss, och att Gamle Doktorns Hus är beviset på att det gick att göra tvärtom.`,
    awareness: "Unaware",
    angle: "Worldview",
  },
];

async function main() {
  const db = createServerSupabase();

  const { data: prod } = await db
    .from("products")
    .select("name, description, target_audience, ingredients")
    .eq("slug", PRODUCT)
    .eq("workspace_id", WORKSPACE_ID)
    .maybeSingle();
  if (!prod) throw new Error(`Produkt ${PRODUCT} hittades inte i workspace ${WORKSPACE_ID}`);

  const productName = prod.name || PRODUCT;
  const brandBrief = [REGLER, FAKTA, MALET].join("\n\n");

  const { data: top } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", WORKSPACE_ID)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNumber = (top?.concept_number ?? 0) + 1;

  const banned = [...REDAN_ANVANT];

  // Tillåter en delkörning: `... onsjo-annonskoncept.ts vilande-drommen kategorin-finns-inte`
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const koer = only.length ? VINKLAR.filter((v) => only.includes(v.key)) : VINKLAR;
  if (!koer.length) throw new Error(`Ingen vinkel matchade: ${only.join(", ")}`);

  for (const v of koer) {
    console.log(`\n=== ${v.key} (${v.awareness}, ${v.angle}) - ${banned.length} bannade hooks ===`);
    const segmentNote = [v.drivkraft, hookBan(banned)].filter(Boolean).join("\n\n");

    try {
      const result = await generateVettedConcepts(
        {
          productName,
          language: LANGUAGE,
          brandBrief,
          segmentNote,
          awarenessLevel: v.awareness,
          angle: v.angle,
          count: 1, // <- egen hook-batch per vinkel
        },
        {
          judge: false, // bedöms i stället av bedom() nedan, se kommentaren där
          onConcept: async ({ proposal }: { proposal: ConceptProposal }) => {
            const judge = await bedom(proposal);
            const ledHook = proposal.cash_dna.hooks?.[0];
            const { data: job, error } = await db
              .from("image_jobs")
              .insert({
                name: proposal.concept_name,
                product: PRODUCT,
                status: "ready",
                target_languages: ["sv"],
                target_ratios: ["4:5", "9:16"],
                concept_number: nextNumber,
                tags: [
                  ...(proposal.suggested_tags ?? []),
                  "genesis-generated",
                  BATCH_TAG,
                  `vinkel:${v.key}`,
                  `judge:${judge.verdict}`,
                ],
                cash_dna: proposal.cash_dna,
                ad_copy_primary: proposal.ad_copy_primary,
                ad_copy_headline: proposal.ad_copy_headline ?? [],
                visual_direction: proposal.visual_direction ?? null,
                source_language: "sv",
                workspace_id: WORKSPACE_ID,
              })
              .select("id")
              .single();

            if (error || !job) {
              console.log(`  PERSIST FAILED: ${error?.message}`);
              return;
            }
            console.log(`  #${nextNumber} [${judge.verdict} ${judge.score}] ${proposal.concept_name}`);
            console.log(`     id=${job.id}`);
            if (judge.issues.length) {
              judge.issues.forEach((i) => console.log(`     ${i.severity}/${i.type}: "${i.quote}"`));
            }
            if (ledHook) banned.push(ledHook);
            nextNumber++;
          },
        },
      );
      for (const e of result.errors) console.log(`  GEN ERROR: ${e}`);
    } catch (err) {
      console.log(`  VINKEL FAILED: ${(err as Error).message}`);
    }
  }
  console.log("\nDONE");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
