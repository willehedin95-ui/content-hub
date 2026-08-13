// Onsjö 415A - AI-bilder till annonserna (bana A).
//
// Två skillnader mot körning 1 (2026-08-13), båda avsiktliga:
//
// 1. referenceStrategy tvingas till "none" på varje brief. Referenstestet samma dag visade
//    att nano-banana behåller platsens karaktär men hittar på detaljerna: skylten
//    "INSENSE HOTELL" blev "INSENSE Bolkm", neonskylten "Halmstad" blev "Bakwriaol", en
//    dörr tillkom och taklinjen ändrades. En AI-bild får därför aldrig föreställa
//    fastigheten. Riktiga foton på huset hanteras av onsjo/bygg-annonsbilder.py.
//    De här bilderna är känslobilder som ska stoppa skrollen, inte visa objektet.
//
// 2. textCorrection och imageQa är PÅ. Genesis-panelens väg kör dem inte, vilket är
//    varför körning 1 gav "OM DU" med förvrängda bokstäver och en bild som skrev ut sin
//    egen instruktionsetikett "LEFT SIDE PAIN STATE" som synlig engelsk text.
//
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-annonsbilder.ts <jobId> [<jobId> ...]

import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateImageBriefs } from "../src/lib/static-ad-prompt";
import { generateStaticImages } from "../src/lib/generate-static-images";
import type { ImageJob, ProductFull } from "../src/types";

const WORKSPACE_ID = "59ab7d80-3fb8-40a0-920e-cce602d79137";
const ANTAL = 3;

// Första körningen skrev en brief som började "man in his early 50s named Stefan" och
// renderade ett fotorealistiskt porträtt av en säljare som inte finns. Annonsen går ut
// från Facebook-sidan "Stefan Hedin", i hans eget namn, och ett riktigt telefonfoto av
// honom står redan på att-göra-listan. Ett uppdiktat ansikte är samma sorts förfalskning
// som ett uppdiktat hus.
const ANONYMITETSKRAV = [
  "HARD RULE: never depict Stefan, Marie, or any named person from the story.",
  "No recognisable human face may appear. Hands, backs, silhouettes and distant unidentifiable figures are fine.",
  "HARD RULE: never depict the property being sold, its buildings, courtyard, signage or interiors.",
  "These images are mood and pattern-interrupt only. The real property is shown with real photographs elsewhere.",
].join(" ");

// Sista spärren om briefmodellen ändå namnger någon.
const NAMNGIVEN = /\bnamed\s+(Stefan|Marie)\b|\b(Stefan|Marie)['’]?s?\s+(face|portrait|smile)\b/i;

async function main() {
  const jobIds = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!jobIds.length) throw new Error("Ange minst ett image_job-id");

  const db = createServerSupabase();

  for (const jobId of jobIds) {
    const { data: job } = await db
      .from("image_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("workspace_id", WORKSPACE_ID)
      .single();
    if (!job) {
      console.log(`${jobId}: hittades inte i workspacet`);
      continue;
    }

    const { data: product } = await db.from("products").select("*").eq("slug", job.product).single();
    if (!product) {
      console.log(`${jobId}: produkten ${job.product} saknas`);
      continue;
    }

    console.log(`\n=== #${job.concept_number} ${job.name} ===`);

    // Briefsen skrivs som vanligt, men utan produktbilder i indata, så modellen
    // aldrig ombeds placera fastigheten i bilden.
    const { briefs } = await generateImageBriefs({
      job: job as ImageJob,
      product: product as ProductFull,
      productImages: [],
      count: ANTAL,
      generationLanguage: "sv",
      iterationContext: { hard_rules: ANONYMITETSKRAV },
    });

    const trasiga = briefs.filter((b) => NAMNGIVEN.test(b.prompt));
    if (trasiga.length) {
      // Fångar det som halkar igenom briefreglerna. Hellre färre bilder än en
      // uppdiktad Stefan i en annons som går ut i Stefans eget namn.
      console.log(`  KASTAR ${trasiga.length} brief(s) som avbildar en namngiven person:`);
      trasiga.forEach((b) => console.log(`    ${b.prompt.slice(0, 120)}`));
    }

    // Hängslen och livrem: även om brief-modellen skulle be om produktreferens
    // struntar vi i det. resolveReferenceImages returnerar tom lista på "none".
    const utanReferens = briefs
      .filter((b) => !NAMNGIVEN.test(b.prompt))
      .map((b) => ({ ...b, referenceStrategy: "none" as const }));
    if (!utanReferens.length) {
      console.log("  inga användbara briefs kvar, hoppar över");
      continue;
    }
    utanReferens.forEach((b) => console.log(`  ${b.style}: ${b.prompt.slice(0, 110)}...`));

    const res = await generateStaticImages({
      jobId,
      workspaceId: WORKSPACE_ID,
      injectedBriefs: utanReferens,
      batchLabel: "annons-2026-08-13",
      textCorrection: true,
      imageQa: true,
    });

    console.log(`  klart: ${res.generated} bilder, ${res.failed} misslyckade, $${res.costUsd.toFixed(3)}`);
    res.errors.forEach((e) => console.log(`  FEL: ${e}`));
    res.sourceImages.forEach((s) => console.log(`  ${s.style}  ${s.original_url}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
