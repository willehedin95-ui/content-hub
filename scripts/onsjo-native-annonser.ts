// Parar ihop native-bilderna med konceptcopyn och skriver native-annonser.json.
//
// Kopplingen görs på drivkraft: varje sak i onsjo-native-saker.ts är taggad med samma
// vinkel som ett av koncepten, så köksbordet en söndagskväll hamnar på söndagskvälls-copyn
// och vindrutan i gryningen på pendlingscopyn.
//
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-native-annonser.ts

import { writeFileSync } from "fs";
import { createServerSupabase } from "../src/lib/supabase-admin";
import { SAKER } from "./onsjo-native-saker";

const WORKSPACE_ID = "59ab7d80-3fb8-40a0-920e-cce602d79137";
const UT = "/Users/williamhedin/Claude Code/onsjo/native-annonser.json";

// Rubrikboten skriver ibland om Stefan i tredje person till en brödtext i jag-form.
const TREDJE_PERSON = /\b(han|hon|hans|hennes|paret)\b/i;

async function main() {
  const db = createServerSupabase();

  const { data: jobs } = await db
    .from("image_jobs")
    .select("id, concept_number, name, tags, ad_copy_primary, ad_copy_headline")
    .eq("workspace_id", WORKSPACE_ID)
    .contains("tags", ["onsjo-annons-2026-08-13"]);

  const copyPerVinkel = new Map<string, { nr: number; brodtext: string; rubriker: string[] }>();
  for (const j of jobs ?? []) {
    const tags = (j.tags ?? []) as string[];
    if (tags.some((t) => t.startsWith("kasserad:") || t.startsWith("dubblett:"))) continue;
    const vinkel = tags.find((t) => t.startsWith("vinkel:"))?.slice(7);
    if (!vinkel) continue;
    copyPerVinkel.set(vinkel, {
      nr: j.concept_number as number,
      brodtext: (j.ad_copy_primary as string[])?.[0] ?? "",
      rubriker: (j.ad_copy_headline as string[]) ?? [],
    });
  }

  const { data: bildjobb } = await db
    .from("image_jobs")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .contains("tags", ["onsjo-native-saker"])
    .maybeSingle();
  if (!bildjobb) throw new Error("Bildjobbet onsjo-native-saker saknas, kör onsjo-native-saker.ts först");

  const { data: bilder } = await db
    .from("source_images")
    .select("original_url, generation_prompt, generation_style")
    .eq("job_id", bildjobb.id);

  const rader = [];
  const utan = [];
  for (const sak of SAKER) {
    // Motivet är unikt per sak, så prompten identifierar bilden.
    const bild = (bilder ?? []).find((b) => (b.generation_prompt ?? "").includes(sak.motiv.slice(0, 60)));
    const copy = copyPerVinkel.get(sak.vinkel);
    if (!bild || !copy) {
      utan.push(`${sak.key} (${!bild ? "ingen bild" : "ingen copy för " + sak.vinkel})`);
      continue;
    }
    rader.push({
      namn: `native-${sak.key}`,
      vinkel: sak.vinkel,
      koncept: copy.nr,
      // Lokal sökväg relativt annonsbilder/, eftersom onsjo-publicera-meta.ts laddar upp
      // filer och inte URL:er. Supabase-URL:en behålls som referens.
      bild: `native/${sak.key === "bordet-klockan-fyra" ? "bordet-fyra" : sak.key}.jpg`,
      bild_url: bild.original_url,
      rubrik: copy.rubriker.find((r) => !TREDJE_PERSON.test(r)) ?? copy.rubriker[0] ?? "",
      brodtext: copy.brodtext,
    });
  }

  writeFileSync(UT, JSON.stringify(rader, null, 2), "utf8");
  console.log(`${rader.length} native-annonser -> ${UT}`);
  rader.forEach((r) => console.log(`  ${r.namn.padEnd(28)} koncept #${r.koncept}  "${r.rubrik}"`));
  if (utan.length) console.log(`\nUtan par: ${utan.join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
