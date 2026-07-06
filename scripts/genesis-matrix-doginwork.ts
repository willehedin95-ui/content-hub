// One-off: wide Genesis exploration matrix for Valpakademin (2026-07-06).
// 18 concepts over 14 vinklar (problem x ton + 4 fristående). No auto-images -
// statics are generated manually on survivors after William's swipe.
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/genesis-matrix-doginwork.ts

import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateVettedConcepts } from "../src/lib/genesis-pipeline";
import { findBestLandingPage } from "../src/lib/landing-page-recommender";
import type { Angle, AwarenessLevel, ConceptProposal } from "../src/types";
import type { JudgeResult } from "../src/lib/creative-judge";

const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";
const PRODUCT = "valpakademin";
const BATCH_TAG = "matrix-2026-07-06";
const LANGUAGE = "Swedish";
const SOURCE_LANGUAGE = "sv";
const TARGET_LANGUAGES = ["sv"];

// Tone blocks (psychology axis) - appended to the problem description.
const TON_TIDIGT =
  "PSYKOLOGISKT LÄGE: Tidigt i problemet. Kaoset är färskt (mindre än en månad), hon har INTE hunnit prova metoder och misslyckas, självtvivlet har inte satt sig. Hon lider men har inte failat. Ton: fånga problemet nu innan det biter sig fast - utvecklingsfönstret (0-3 månader) är äkta urgency. FÖRBJUDET: 'det är inte ditt fel att inget funkat'-framing - hon har inget misslyckande att frias från.";
const TON_TVIVLARE =
  "PSYKOLOGISKT LÄGE: Utmattad tvivlare. Hon har kämpat i 1-6 månader, provat råd från FB-grupper och Google som inte höll, och tanken 'är min valp svårare än andra?' har slagit henne. Inre monolog: 'världens sämsta matte'. Ton: normalisera + externalisera skulden ('du fick fel metod, inte fel valp') och förklara VARFÖR det hon provat inte funkade (kommandon utan trygghetsgrund). Skammen är PRIVAT - dramatisera aldrig dömande grannar/omgivning.";

interface Vinkel {
  key: string;
  segmentNote: string;
  awareness: AwarenessLevel;
  angle?: Angle;
  count: number;
}

const PROBLEM = {
  bitande:
    "PROBLEM: Bitandet som inte slutar (vanligaste problemet, 23.5% i quizet). Valpen biter händer, byxben och möbler. Kundcitat: 'Min golden hade en bitperiod då hon var totalt hopplös... bet säkert 20-30 ggr/dag', 'som lilla pirayan', 'valptänderna titt som tätt - händer, underarmar, fötter', 'att bli arg och fya hjälpte inte ett dugg'.",
  kvall:
    "PROBLEM: Hyperaktiv utan kontroll, värst på kvällarna (20.3% i quizet). Springer i cirklar, biter, skäller, går inte att stoppa. Kundcitat: 'Det blir lätt hysteriskt på kvällarna', 'Han blir helt manisk. Får stanna 20 ggr på 100 meter'. Dold mekanism: övertrötthet som misstolkas som för lite motion - hon aktiverar mer vilket eldar på kaoset. Optimal valpsömn är 18-20 h/dygn.",
  rumsrenhet:
    "PROBLEM: Rumsrenhet som inte sätter sig (18% i quizet). Kissar och bajsar inne trots ständiga utepromenader, framsteg försvinner lika fort som de kommer. Hon torkar upp flera gånger om dagen och undrar om det någonsin sätter sig. Universell igenkänning: pappersrullen, pölen bakom soffan, mattan som skuras igen.",
  koppel:
    "PROBLEM: Koppeldrag och en valp som inte lyssnar ute (14.1% i quizet). Drar, springer efter allt, tittar aldrig upp. Godiset som funkar i köket ignoreras totalt utomhus. Kundcitat: 'Tänk om hon aldrig vill följa med?'. Mekanism: hon tränar kommandon när det som saknas är kontakt.",
  ater:
    "PROBLEM: Valpen käkar allt den hittar ute - fimpar, sten, bajs, pinnar (10% i quizet). Kundcitat: 'Lite vilt-bajs är väl en sak men resten av buffén är ju så äckligt'. Varje promenad blir en patrull där hon skannar marken före valpen, med förgiftning eller kirurgi i bakhuvudet.",
};

const BAS =
  "Målgrupp: svenska kvinnor 30-60 med valp 0-6 månader, ser hunden som en i familjen (89% relationell), 98% mobil via Facebook. Relationen är varm - det är VARDAGEN som är kaos. Möt henne vid det fysiska (bettet, pölen, kopplet), landa i känslan.";

const VINKLAR: Vinkel[] = [
  // Problem x Tidigt
  { key: "bitande-tidigt", segmentNote: [BAS, PROBLEM.bitande, TON_TIDIGT].join("\n"), awareness: "Problem Aware", count: 2 },
  { key: "kvall-tidigt", segmentNote: [BAS, PROBLEM.kvall, TON_TIDIGT].join("\n"), awareness: "Problem Aware", count: 2 },
  { key: "rumsrenhet-tidigt", segmentNote: [BAS, PROBLEM.rumsrenhet, TON_TIDIGT].join("\n"), awareness: "Problem Aware", angle: "Problem-Agitate", count: 1 },
  { key: "koppel-tidigt", segmentNote: [BAS, PROBLEM.koppel, TON_TIDIGT].join("\n"), awareness: "Problem Aware", angle: "Curiosity", count: 1 },
  { key: "ater-tidigt", segmentNote: [BAS, PROBLEM.ater, TON_TIDIGT].join("\n"), awareness: "Problem Aware", angle: "Problem-Agitate", count: 1 },
  // Problem x Tvivlare
  { key: "bitande-tvivlare", segmentNote: [BAS, PROBLEM.bitande, TON_TVIVLARE].join("\n"), awareness: "Solution Aware", count: 2 },
  { key: "kvall-tvivlare", segmentNote: [BAS, PROBLEM.kvall, TON_TVIVLARE].join("\n"), awareness: "Solution Aware", count: 2 },
  { key: "rumsrenhet-tvivlare", segmentNote: [BAS, PROBLEM.rumsrenhet, TON_TVIVLARE].join("\n"), awareness: "Solution Aware", angle: "Root Cause", count: 1 },
  { key: "koppel-tvivlare", segmentNote: [BAS, PROBLEM.koppel, TON_TVIVLARE].join("\n"), awareness: "Solution Aware", angle: "Root Cause", count: 1 },
  { key: "ater-tvivlare", segmentNote: [BAS, PROBLEM.ater, TON_TVIVLARE].join("\n"), awareness: "Solution Aware", angle: "Story", count: 1 },
  // Fristående vinklar
  {
    key: "erfaren-nyborjare",
    segmentNote: [
      BAS,
      "VINKEL: Erfaren hundägare som känner sig nybörjare igen. Kundcitat som bär hela hooken: 'Detta är min 4:e labrador men ändå när min lilla valp kommer hem så känner jag mig som nybörjare', 'försöker minnas hur vi gjorde för 15 år sen'. Sårad kompetens-identitet - vill INTE bli tilltalad som nybörjare. Ton: peer-respekt + mekanism-förklaring (träningsläran har ändrats sedan sist - trygghet före kommandon fanns inte i gamla skolan).",
    ].join("\n"),
    awareness: "Problem Aware",
    angle: "Story",
    count: 1,
  },
  {
    key: "varldens-samsta-matte",
    segmentNote: [
      BAS,
      "VINKEL: Den rena känslo-vinkeln - inkompetens-känslan. Kundcitat: 'Idag har jag känt mig som världens sämsta matte', 'Vill typ börja grina, känns hopplöst'. Core wound: 'jag klarar inte vara den människan hunden behöver - och förlorar relationen jag skaffade den för'. Skammen är PRIVAT (hon lurkar i FB-grupper, vågar inte fråga) - spegeln är 'du har inte berättat för någon hur tungt det är'. Landa i: det är metoden som felat, inte hon.",
    ].join("\n"),
    awareness: "Problem Aware",
    angle: "Story",
    count: 1,
  },
  {
    key: "villain-alfa",
    segmentNote: [
      BAS,
      "VINKEL: Villain/mekanism - skär över alla problem. Boven är 1940-talets dominans/alfa-träning (utvecklad på vargar i fångenskap) som fortfarande dominerar råden hon får: 'var bestämd', 'visa vem som bestämmer'. Hon har följt råden och de funkar inte - för man kan inte träna bort kaos, man måste bygga trygghet först. Vetenskapligt stöd: Patricia McConnell. Ton: aha-upplevelse, 'därför har inget funkat'.",
    ].join("\n"),
    awareness: "Problem Aware",
    angle: "Root Cause",
    count: 1,
  },
  {
    key: "mork-humor",
    segmentNote: [
      BAS,
      "VINKEL: Kundernas egen mörka humor som ton-test. Valpägarna skämtar själva galghumoristiskt om eländet: 'som lilla pirayan' (om valpen som hänger i byxbenen), 'lite vilt-bajs är väl en sak men resten av buffén är ju så äckligt', 'vi kämpar på'. Skriv med samma kärleksfulla galghumor - skrattet som bara den som levt det förstår. ALDRIG på hennes bekostnad, alltid MED henne. Landa varmt: det finns en väg genom.",
    ].join("\n"),
    awareness: "Problem Aware",
    angle: "Curiosity",
    count: 1,
  },
];

async function main() {
  const db = createServerSupabase();

  const { data: prod } = await db
    .from("products")
    .select("name, description, ingredients")
    .eq("slug", PRODUCT)
    .eq("workspace_id", WORKSPACE_ID)
    .maybeSingle();
  const productName = prod?.name || PRODUCT;
  const brandBrief = [prod?.description, prod?.ingredients].filter(Boolean).join(" ").slice(0, 600) || undefined;

  const { data: top } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", WORKSPACE_ID)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNumber = (top?.concept_number ?? 0) + 1;

  let created = 0;
  let rejected = 0;

  const only = process.env.ONLY_VINKEL;
  const vinklar = only ? VINKLAR.filter((v) => v.key === only) : VINKLAR;

  for (const v of vinklar) {
    console.log(`\n=== ${v.key} (${v.count} st, ${v.awareness}${v.angle ? ", " + v.angle : ", auto-angle"}) ===`);
    try {
      const result = await generateVettedConcepts(
        {
          productName,
          language: LANGUAGE,
          brandBrief,
          segmentNote: v.segmentNote,
          awarenessLevel: v.awareness,
          angle: v.angle,
          count: v.count,
        },
        {
          judge: true,
          onConcept: async ({ proposal, judge }: { proposal: ConceptProposal; judge: JudgeResult }) => {
            if (judge.verdict === "REJECT") rejected++;
            const landingPageId = await findBestLandingPage(db, WORKSPACE_ID, PRODUCT, {
              adCopyPrimary: proposal.ad_copy_primary,
              adCopyHeadline: proposal.ad_copy_headline,
              conceptName: proposal.concept_name,
            });
            const { data: job, error } = await db
              .from("image_jobs")
              .insert({
                name: proposal.concept_name,
                product: PRODUCT,
                status: "draft",
                target_languages: TARGET_LANGUAGES,
                target_ratios: ["4:5", "9:16"],
                concept_number: nextNumber,
                tags: [...(proposal.suggested_tags ?? []), "genesis-generated", BATCH_TAG, `vinkel:${v.key}`, `judge:${judge.verdict}`],
                cash_dna: proposal.cash_dna,
                ad_copy_primary: proposal.ad_copy_primary,
                ad_copy_headline: proposal.ad_copy_headline ?? [],
                visual_direction: proposal.visual_direction ?? null,
                source_language: SOURCE_LANGUAGE,
                workspace_id: WORKSPACE_ID,
                ...(landingPageId ? { landing_page_id: landingPageId } : {}),
              })
              .select("id")
              .single();
            if (error || !job) {
              console.log(`  PERSIST FAILED: ${error?.message}`);
              return;
            }
            console.log(`  #${nextNumber} [${judge.verdict} ${judge.score}] ${proposal.concept_name}`);
            nextNumber++;
            created++;
          },
        },
      );
      for (const e of result.errors) console.log(`  GEN ERROR: ${e}`);
    } catch (err) {
      console.log(`  VINKEL FAILED: ${(err as Error).message}`);
    }
  }

  console.log(`\nDONE: ${created} koncept skapade (${rejected} judge-REJECT, regenererade en gång), tagg: ${BATCH_TAG}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
