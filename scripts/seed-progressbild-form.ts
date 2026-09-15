/**
 * Seedar progressbildsformuläret (hydro13 workspace, market SE).
 *
 * Fyra slides enligt "Envana progress"-specen: intro, e-post, bild, klart.
 * Copy är tagen ordagrant därifrån. Slide 4 är formulärets success-ending.
 *
 * ETT formulär bär alla tre bilderna (dag 1, 30, 60). Vilken bild det gäller
 * kommer från ?steg=1|2|3 på värdsidan och fångas av ett `hidden`-fält, så vi
 * slipper hålla tre kopior i synk. Zooki har ett formulär per milstolpe.
 *
 * E-postfältet förifylls från ?e= i länken. Mailen från Klaviyo sätter den
 * från profilen, så adressen skrivs bara en gång: vid första bilden, som nås
 * via QR-koden på det tryckta kortet (identiskt för alla, därför ingen
 * identitet i länken).
 *
 * Samtycket ligger INTE här. Det är en egen sida enligt specen, seedad av
 * scripts/seed-samtycke-form.ts, och den triggar belöningen.
 *
 * Idempotent: upsertar på (workspace_id, slug, market).
 *
 *   npx tsx scripts/seed-progressbild-form.ts
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

import { createClient } from "@supabase/supabase-js";
import type { FormConfig } from "../src/types/forms";

const HYDRO13_WORKSPACE_ID = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7";

const progressbild: FormConfig = {
  submitLabel: "Ladda upp bilden",
  ticket: { kindLabel: "Progressbild", priority: 1 },
  fields: [
    // Bärs av länken: ?steg=1|2|3. Utan parameter antas första bilden.
    { kind: "hidden", key: "steg", label: "Steg", fromParam: "steg", fallback: "1" },

    // --- Slide 2: e-post ---
    // ETT fält. Två fält med samma key men olika showWhen gick inte: embedens
    // villkorsuppdatering slår upp wrappen med querySelector('[data-key=...]'),
    // som bara hittar den första, så det andra fältet doldes aldrig och båda
    // syntes samtidigt. Labeln är därför formulerad så den håller för alla tre
    // bilderna. Förklaringen under är specens, ordagrant.
    {
      kind: "email",
      key: "email",
      label: "Din e-postadress",
      required: true,
      role: "email",
      fromParam: "e",
      help: "Vi använder den för att koppla dina bilder till dig och påminna dig när det är dags att ta nästa bild.",
    },
    { kind: "pagebreak", key: "till_bild", label: "Fortsätt" },

    // --- Slide 3: bilden ---
    // Rubriken forst, sedan uppladdningszonen, sedan instruktionerna. Tidigare
    // lag 108 ord text ovanfor rutan: 625 av 812 px pa en telefon, sa det hon
    // kom for hamnade vid fold-kanten.
    {
      kind: "info",
      key: "rubrik_1",
      showWhen: { field: "steg", in: ["1"] },
      html: `<h2>Dags att ta din första bild</h2>`,
    },
    {
      kind: "info",
      key: "rubrik_2",
      showWhen: { field: "steg", in: ["2"] },
      html: `<h2>Dags att ta din 30-dagarsbild</h2>`,
    },
    {
      kind: "info",
      key: "rubrik_3",
      showWhen: { field: "steg", in: ["3"] },
      html: `<h2>Dags att ta din sista bild</h2><p style="margin:0">Bild tre av tre.</p>`,
    },
    {
      kind: "file",
      key: "bild",
      label: "Din bild",
      required: true,
      accept: "image/*",
      maxFiles: 1,
      placeholder: "Välj en bild",
    },
    // Integritetsloftet star kvar direkt under rutan - det ar det som far
    // henne att vaga ladda upp, och far inte hamna bakom en utfallning.
    {
      kind: "info",
      key: "integritet",
      // Normal vikt, inte fet. I fetstil tog den sex rader och mer visuell
      // tyngd an bade uppladdningszonen och knappen, alltsa tvartemot
      // hierarkin pa skarmen. Den ska inge trygghet, inte konkurrera.
      html: `<p style="margin:0;font-size:.92em;color:#444">Dina bilder är privata och används bara för att hjälpa dig följa din resa. Vi använder aldrig dina bilder i marknadsföring eller annan kommunikation utan ditt tydliga godkännande.</p>`,
    },
    {
      kind: "info",
      key: "tips",
      html: `<details style="margin:0"><summary style="cursor:pointer;font-weight:600">Så tar du en bra bild</summary>
<p style="margin:10px 0 0">Du väljer själv vad du vill följa. Du kan ta en bild på hela ansiktet eller fokusera på ett område där du särskilt vill se förändring, till exempel runt ögonen, munnen eller på halsen.</p>
<p style="margin:10px 0 0">Det viktigaste är att bilden är tydlig och tagen i bra ljus. Försök gärna att ta dina kommande bilder på samma plats, i samma ljus och från samma vinkel. Då blir det mycket lättare att jämföra din utveckling över tid.</p></details>`,
    },
  ],
  endings: {
    // --- Slide 4 ---
    success: {
      title: "Klart!",
      // Specen skriver "Din första bild" - den beskriver första uppladdningen.
      // Samma ending visas vid alla tre och kan inte villkoras, så ordet
      // "första" är struket. Sista raden är tillagd: hon ska veta vad som
      // händer härnäst, inte bara att något hände.
      html: `<p>Din bild är på väg till din inkorg.</p>
<p style="opacity:.75">Det kan ta några minuter.</p>
<p style="margin-top:14px">Vi hör av oss när det är dags för nästa bild om 30 dagar. Ta Envana varje dag tills dess, det är det som avgör hur mycket du ser.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("forms").upsert(
    {
      workspace_id: HYDRO13_WORKSPACE_ID,
      slug: "progressbild",
      market: "se",
      name: "Progressbild (Envana)",
      status: "published",
      config: progressbild,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,slug,market" }
  );

  if (error) {
    console.error("Kunde inte seeda progressbild:", error.message);
    process.exit(1);
  }
  console.log("OK: progressbild (se) seedad for hydro13");
}

main();
