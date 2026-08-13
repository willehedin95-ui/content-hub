// Bygger onsjo/annonsbilder/annonser.json, indata till onsjo-publicera-meta.ts.
//
// Kopplingen koncept -> bild är ett kreativt val. Skriptet gör bara ett förslag som
// parar ihop varje vinkel med den bild vars text ligger närmast samma drivkraft.
// Ändra PARNING innan publicering, eller redigera JSON-filen direkt.
//
// Rubriken tas som ad_copy_headline[0]. De fem rubrikerna per koncept ligger kvar i
// image_jobs, så det går att byta utan att generera om något.
//
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-bygg-annonslista.ts

import { writeFileSync } from "fs";
import { createServerSupabase } from "../src/lib/supabase-admin";

const WORKSPACE_ID = "59ab7d80-3fb8-40a0-920e-cce602d79137";
const UT = "/Users/williamhedin/Claude Code/onsjo/annonsbilder/annonser.json";

// vinkel -> bildfil i onsjo/annonsbilder/
const PARNING: Record<string, string> = {
  "vilande-drommen": "band-02-4x5.jpg",
  "kategorin-finns-inte": "band-10-4x5.jpg",
  "byggde-utan-att-kunna": "scrim-18-4x5.jpg",
  "delade-vardagen": "band-41-4x5.jpg",
  "ovanliga-manniskor": "scrim-02-4x5.jpg",
  "godtyckliga-regler": "scrim-41-4x5.jpg",
};

async function main() {
  const db = createServerSupabase();
  const { data: jobs } = await db
    .from("image_jobs")
    .select("concept_number, name, tags, ad_copy_primary, ad_copy_headline")
    .eq("workspace_id", WORKSPACE_ID)
    .contains("tags", ["onsjo-annons-2026-08-13"])
    .order("concept_number", { ascending: true });

  // Headline-boten skriver ibland om Stefan i tredje person ("Han hade aldrig drivit ett
  // hotell") medan brödtexten står i hans jag-form. Ta första rubriken som inte gör det.
  const TREDJE_PERSON = /\b(han|hon|hans|hennes|de|dem|paret)\b/i;
  const valjRubrik = (rubriker: string[]): string =>
    rubriker.find((r) => !TREDJE_PERSON.test(r)) ?? rubriker[0] ?? "";

  const uteslut = (tags: string[]) =>
    tags.some((t) => t.startsWith("kasserad:") || t.startsWith("dubblett:"));

  const rader = (jobs ?? [])
    .filter((j) => !uteslut(j.tags ?? []))
    .map((j) => {
      const vinkel = (j.tags ?? []).find((t: string) => t.startsWith("vinkel:"))?.slice(7) ?? "";
      return {
        namn: `#${j.concept_number} ${vinkel}`,
        bild: PARNING[vinkel] ?? "",
        brodtext: (j.ad_copy_primary as string[])?.[0] ?? "",
        rubrik: valjRubrik((j.ad_copy_headline as string[]) ?? []),
      };
    })
    .filter((r) => r.bild && r.brodtext);

  writeFileSync(UT, JSON.stringify(rader, null, 2), "utf8");
  console.log(`${rader.length} annonser -> ${UT}`);
  rader.forEach((r) => console.log(`  ${r.namn}  ${r.bild}  "${r.rubrik}"`));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
