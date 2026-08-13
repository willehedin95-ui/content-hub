// Onsjö 415A - native unaware-annonser. Bilder på SAKER, inget annat.
//
// Idén: läsaren vet inte att hen är på marknaden. En bild på ett hus säger "bostadsannons"
// och filtreras bort på reflex. En bild på ett köksbord en söndagskväll säger ingenting alls,
// och då är det copyn som får göra jobbet.
//
// Briefsen är HANDSKRIVNA här, inte skrivna av briefmodellen. Skälet är att modellen valde
// fel förra gången: den skrev "man in his early 50s named Stefan" och renderade ett porträtt
// av en säljare som inte finns. Hårdkodade briefs har inte det problemet.
//
// Tre regler i varje prompt:
//   1. Ingen läsbar text någonstans i bilden. Det tar bort risken för trasig svenska helt,
//      i stället för att försöka rätta den efteråt.
//   2. Inga ansikten. Händer går bra.
//   3. Ingenting som föreställer fastigheten. Den visas med riktiga foton, inte genererade.
//
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-native-saker.ts

import { pathToFileURL } from "url";
import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateStaticImages } from "../src/lib/generate-static-images";
import type { ImageBrief } from "../src/lib/static-ad-prompt";

const WORKSPACE_ID = "59ab7d80-3fb8-40a0-920e-cce602d79137";
const PRODUCT = "onsjo-415a";
const BATCH_TAG = "onsjo-native-saker";

const GEMENSAMT = [
  "Shot on a phone in available light, slightly off-centre framing, mild sensor noise, no studio lighting, no professional retouching.",
  "Swedish domestic setting, ordinary and unstyled.",
  "ABSOLUTELY NO legible text anywhere in the frame: no signs, no labels, no readable screens, no handwriting that resolves into words. Any writing must be an indistinct scrawl.",
  "No human faces. Hands are fine.",
  "Nothing resembling a hotel, guest rooms, a courtyard, or a property listing.",
].join(" ");

export interface Sak {
  key: string;
  vinkel: string;
  style: "native-messy" | "native-closeup";
  motiv: string;
}

export const SAKER: Sak[] = [
  {
    key: "sondagskvallen",
    vinkel: "vilande-drommen",
    style: "native-messy",
    motiv:
      "A kitchen table late on a Sunday evening after the meal is over. One wine glass with a swallow left in it, a folded napkin, crumbs, the dishwasher door standing half open behind. A single warm lamp. The window behind is black.",
  },
  {
    key: "servetten",
    vinkel: "vilande-drommen",
    style: "native-closeup",
    motiv:
      "A paper napkin on a kitchen counter with a rough ballpoint sketch of two small buildings and a line between them, an indistinct scrawl beside it that has been crossed out hard. A cheap pen lying across it, a coffee ring soaking into one corner.",
  },
  {
    key: "vindrutan",
    vinkel: "delade-vardagen",
    style: "native-closeup",
    motiv:
      "Seen from the driver's seat at dawn in winter: a windscreen half scraped clear of frost, the unscraped part still opaque, dashboard lights glowing faintly, an empty residential street beyond, headlights on wet asphalt.",
  },
  {
    key: "hallhyllan",
    vinkel: "delade-vardagen",
    style: "native-closeup",
    motiv:
      "A hallway shelf in the dark before anyone is awake: car keys on a worn leather fob, a wool hat, a work lanyard hanging over the edge, one coat on a hook. The only light comes from a streetlamp through the door glass.",
  },
  {
    key: "termosen",
    vinkel: "delade-vardagen",
    style: "native-messy",
    motiv:
      "A steel thermos and a plastic lunch box on the passenger seat of a car in the dark, seatbelt buckle beside them, a scattering of old receipts in the door pocket, faint condensation on the side window.",
  },
  {
    key: "bordet-klockan-fyra",
    vinkel: "ovanliga-manniskor",
    style: "native-messy",
    motiv:
      "A long table at four in the morning after a party nobody planned: wine glasses with dregs, a candle burnt down to a pool of wax, chairs pushed back at odd angles, one chair fallen sideways, first grey daylight in the window.",
  },
  {
    key: "byggritningen",
    vinkel: "byggde-utan-att-kunna",
    style: "native-messy",
    motiv:
      "A kitchen table with a large folded technical drawing spread across it, creased from being carried. A flat carpenter's pencil, a steel tape measure, a mug leaving a ring on the paper, sawdust caught in the folds. The drawing's lines are visible but no dimension figures are legible.",
  },
  {
    key: "kalendern",
    vinkel: "godtyckliga-regler",
    style: "native-closeup",
    motiv:
      "A paper wall calendar photographed at a slight angle. Every weekday square is filled edge to edge with the same anonymous block of ink, week after week, the weekend squares left blank. No words or numbers resolve.",
  },
  {
    key: "pendeltaget",
    vinkel: "godtyckliga-regler",
    style: "native-closeup",
    motiv:
      "A commuter train window at night, rain beading on the outside, the empty carriage reflected in the glass, fluorescent strip light, black landscape rushing past behind the reflection.",
  },
  {
    key: "nyckeln",
    vinkel: "kategorin-finns-inte",
    style: "native-closeup",
    motiv:
      "A single old iron key lying on a worn painted wooden windowsill, paint chipped down to bare wood. Through the window, out of focus, open fields and a treeline in soft daylight.",
  },
];

async function main() {
  const db = createServerSupabase();

  // Ett eget jobb som håller hela uppsättningen, så de inte blandas med koncepten.
  const { data: befintligt } = await db
    .from("image_jobs")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .contains("tags", [BATCH_TAG])
    .maybeSingle();

  let jobId = befintligt?.id as string | undefined;

  if (!jobId) {
    const { data: top } = await db
      .from("image_jobs")
      .select("concept_number")
      .eq("workspace_id", WORKSPACE_ID)
      .not("concept_number", "is", null)
      .order("concept_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: nytt, error } = await db
      .from("image_jobs")
      .insert({
        name: "Native unaware - saker",
        product: PRODUCT,
        status: "ready",
        target_languages: ["sv"],
        target_ratios: ["4:5"],
        concept_number: (top?.concept_number ?? 0) + 1,
        tags: [BATCH_TAG, "native", "unaware"],
        visual_direction: "Vardagsföremål som bär känslan. Aldrig fastigheten, aldrig ansikten, aldrig text.",
        ad_copy_primary: ["Bildbank för native unaware-annonser. Copyn kommer från koncepten."],
        ad_copy_headline: [],
        source_language: "sv",
        workspace_id: WORKSPACE_ID,
      })
      .select("id")
      .single();
    if (error || !nytt) throw new Error(`Kunde inte skapa jobbet: ${error?.message}`);
    jobId = nytt.id;
    console.log(`Nytt jobb ${jobId}`);
  } else {
    console.log(`Återanvänder jobb ${jobId}`);
  }

  const briefs: ImageBrief[] = SAKER.map((s) => ({
    style: s.style,
    prompt: `${s.motiv} ${GEMENSAMT}`,
    hookText: s.key,
    headlineText: "",
    referenceStrategy: "none",
  }));

  console.log(`${briefs.length} bilder, ca $${(briefs.length * 0.06).toFixed(2)}\n`);

  const res = await generateStaticImages({
    jobId: jobId!,
    workspaceId: WORKSPACE_ID,
    injectedBriefs: briefs,
    batchLabel: BATCH_TAG,
    // Ingen textkorrigering: briefsen förbjuder text i bilden, så det finns inget att rätta.
    //
    // imageQa AVSTÄNGD, och det är avsiktligt. Första körningen 2026-08-13 fick QA att
    // underkänna ALLA tio bilder två gånger var, alltid med samma motivering: bilden
    // föreställer inte Onsjö 415A. Exempel ordagrant: "The image shows an old key on a
    // windowsill with a view of a field, which does not match the description of 'Onsjö
    // 415A' (two buildings, one residential and one commercial/hotel)." Att bilden INTE
    // föreställer fastigheten är hela poängen med native unaware. QA gjorde alltså 19
    // extra renderingar för att sedan behålla originalen ändå när omförsöken tog slut.
    // Samma slags fel som copydomaren, som blockerade copy för att den inte nämnde
    // produktnamnet. Hubbens kvalitetsgrindar utgår från att annonsen visar produkten.
    imageQa: false,
  });

  console.log(`\n${res.generated} klara, ${res.failed} misslyckade, $${res.costUsd.toFixed(2)}`);
  res.errors.forEach((e) => console.log(`FEL: ${e}`));
  res.sourceImages.forEach((s) => {
    const sak = SAKER.find((x) => x.key === s.label.split(": ")[1]?.replace("...", "") || x.key === s.label);
    console.log(`${(sak?.key ?? s.label).padEnd(22)} ${sak?.vinkel ?? ""}  ${s.original_url}`);
  });
}

// Kör BARA när filen körs direkt. Utan den här spärren startade en `import { SAKER }`
// från onsjo-native-annonser.ts en skarp rendering: åtta bilder hann faktureras innan
// den importerande processen avslutade, och ingen av dem sparades.
const kordDirekt = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (kordDirekt) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
