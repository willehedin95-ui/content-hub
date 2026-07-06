// One-off refill after hook-collision cleanup (2026-07-06): 4 replacement concepts
// with EXPLICIT hook bans so every concept in the batch tests a DIFFERENT opening.
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/genesis-matrix-refill.ts

import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateVettedConcepts } from "../src/lib/genesis-pipeline";
import { findBestLandingPage } from "../src/lib/landing-page-recommender";
import type { Angle, AwarenessLevel, ConceptProposal } from "../src/types";
import type { JudgeResult } from "../src/lib/creative-judge";

const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";
const PRODUCT = "valpakademin";
const BATCH_TAG = "matrix-2026-07-06";
const LANGUAGE = "Swedish";

const TON_TIDIGT =
  "PSYKOLOGISKT LÄGE: Tidigt i problemet. Kaoset är färskt (mindre än en månad), hon har INTE hunnit prova metoder och misslyckas, självtvivlet har inte satt sig. Ton: fånga problemet nu innan det biter sig fast - utvecklingsfönstret (0-3 månader) är äkta urgency. FÖRBJUDET: 'det är inte ditt fel att inget funkat'-framing.";
const TON_TVIVLARE =
  "PSYKOLOGISKT LÄGE: Utmattad tvivlare. Hon har kämpat i 1-6 månader, provat råd som inte höll, och tanken 'är min valp svårare än andra?' har slagit henne. Ton: normalisera + externalisera skulden ('du fick fel metod, inte fel valp') och förklara VARFÖR det hon provat inte funkade. Skammen är PRIVAT - aldrig dömande grannar.";

const BAS =
  "Målgrupp: svenska kvinnor 30-60 med valp 0-6 månader, ser hunden som en i familjen, 98% mobil via Facebook. Relationen är varm - det är VARDAGEN som är kaos.";

function hookBan(banned: string[]): string {
  return [
    "HOOK-KRAV (ABSOLUT): Denna batch testar OLIKA hooks. Följande öppningar är REDAN UPPTAGNA och FÅR INTE användas, parafraseras eller efterliknas i första meningen:",
    ...banned.map((b) => `- "${b}"`),
    "Välj en STRUKTURELLT annorlunda hook-typ än 'jag-bekännelse med siffra' - t.ex. en fråga, en scen mitt i handlingen, ett citat/dialog, ett kontraintuitivt påstående eller en specifik tidpunkt/plats. Hooken ska klara sig utan siffran 30 och utan ordet 'cirklar'.",
  ].join("\n");
}

const PROBLEM_BITANDE =
  "PROBLEM: Bitandet som inte slutar (vanligaste problemet, 23.5% i quizet). Valpen biter händer, byxben och möbler. Underlag (använd INTE som öppningsrad): 'som lilla pirayan', 'valptänderna titt som tätt', 'att bli arg och fya hjälpte inte ett dugg'.";
const PROBLEM_KVALL =
  "PROBLEM: Hyperaktiv utan kontroll, värst på kvällarna (20.3% i quizet). Dold mekanism: övertrötthet som misstolkas som för lite motion - hon aktiverar mer vilket eldar på. Optimal valpsömn är 18-20 h/dygn. Underlag (använd INTE som öppningsrad): 'det blir lätt hysteriskt på kvällarna', 'får stanna 20 ggr på 100 meter'.";

interface Vinkel { key: string; segmentNote: string; awareness: AwarenessLevel; angle?: Angle }

const VINKLAR: Vinkel[] = [
  {
    key: "bitande-tidigt",
    segmentNote: [BAS, PROBLEM_BITANDE, TON_TIDIGT, hookBan(["Min valp bet mig 30 gånger igår"])].join("\n"),
    awareness: "Problem Aware",
    angle: "Story",
  },
  {
    key: "bitande-tvivlare",
    segmentNote: [BAS, PROBLEM_BITANDE, TON_TVIVLARE, hookBan(["Min valp bet mig 30 gånger igår", "Min valp bet mig över 30 gånger om dagen"])].join("\n"),
    awareness: "Solution Aware",
    angle: "Root Cause",
  },
  {
    key: "kvall-tidigt",
    segmentNote: [BAS, PROBLEM_KVALL, TON_TIDIGT, hookBan(["Din valp springer i cirklar och biter på kvällarna", "Din valp springer i cirklar"])].join("\n"),
    awareness: "Problem Aware",
    angle: "Curiosity",
  },
  {
    key: "kvall-tvivlare",
    segmentNote: [BAS, PROBLEM_KVALL, TON_TVIVLARE, hookBan(["Min valp blev helt galen varje kväll klockan åtta", "Min valp sprang i cirklar"])].join("\n"),
    awareness: "Solution Aware",
    angle: "Contrarian",
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

  for (const v of VINKLAR) {
    console.log(`\n=== ${v.key} (${v.awareness}, ${v.angle}) ===`);
    try {
      const result = await generateVettedConcepts(
        { productName, language: LANGUAGE, brandBrief, segmentNote: v.segmentNote, awarenessLevel: v.awareness, angle: v.angle, count: 1 },
        {
          judge: true,
          onConcept: async ({ proposal, judge }: { proposal: ConceptProposal; judge: JudgeResult }) => {
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
                status: "ready",
                target_languages: ["sv"],
                target_ratios: ["4:5", "9:16"],
                concept_number: nextNumber,
                tags: [...(proposal.suggested_tags ?? []), "genesis-generated", BATCH_TAG, `vinkel:${v.key}`, `judge:${judge.verdict}`, "hook-refill"],
                cash_dna: proposal.cash_dna,
                ad_copy_primary: proposal.ad_copy_primary,
                ad_copy_headline: proposal.ad_copy_headline ?? [],
                visual_direction: proposal.visual_direction ?? null,
                source_language: "sv",
                workspace_id: WORKSPACE_ID,
                ...(landingPageId ? { landing_page_id: landingPageId } : {}),
              })
              .select("id")
              .single();
            if (error || !job) { console.log(`  PERSIST FAILED: ${error?.message}`); return; }
            console.log(`  #${nextNumber} [${judge.verdict} ${judge.score}] ${proposal.concept_name}`);
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

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
