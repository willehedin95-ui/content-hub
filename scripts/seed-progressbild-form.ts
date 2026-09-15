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

    // --- Slide 1: intro ---
    {
      kind: "info",
      key: "slide1",
      html: `<h2 style="margin:0 0 10px;font-size:20px;line-height:1.3">Följ din resa i 60 dagar. Få ett presentkort på 200 kr.</h2>
<p style="margin:0">Ladda upp din första bild idag och följ hur din hud förändras över tid.</p>`,
    },
    { kind: "pagebreak", key: "till_epost", label: "Kom igång" },

    // --- Slide 2: e-post ---
    // Frågan står som label och förklaringen som help, så de renderas i den
    // ordning specen visar dem (fråga, förklaring, fält). Tre varianter:
    // specens text gäller första bilden, de andra två följer samma ton.
    {
      kind: "email",
      key: "email",
      label: "Innan du laddar upp din första bild behöver vi din e-postadress.",
      required: true,
      role: "email",
      fromParam: "e",
      showWhen: { field: "steg", in: ["1"] },
      help: "Vi använder den för att koppla dina bilder till dig och påminna dig när det är dags att ta nästa bild.",
    },
    {
      kind: "email",
      key: "email",
      label: "Bekräfta din e-postadress.",
      required: true,
      role: "email",
      fromParam: "e",
      showWhen: { field: "steg", in: ["2", "3"] },
      help: "Samma adress som förra gången, så hamnar bilden i din serie.",
    },
    { kind: "pagebreak", key: "till_bild", label: "Fortsätt" },

    // --- Slide 3: bilden ---
    {
      kind: "info",
      key: "slide3",
      showWhen: { field: "steg", in: ["1"] },
      html: `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.3">Dags att ta din första bild</h2>
<p>Du väljer själv vad du vill följa. Du kan ta en bild på hela ansiktet eller fokusera på ett område där du särskilt vill se förändring, till exempel runt ögonen, munnen eller på halsen.</p>
<p>Det viktigaste är att bilden är tydlig och tagen i bra ljus. Försök gärna att ta dina kommande bilder på samma plats, i samma ljus och från samma vinkel. Då blir det mycket lättare att jämföra din utveckling över tid.</p>
<p style="margin-bottom:0"><strong>Dina bilder är privata och används bara för att hjälpa dig följa din resa. Vi använder aldrig dina bilder i marknadsföring eller annan kommunikation utan ditt tydliga godkännande.</strong></p>`,
    },
    {
      kind: "info",
      key: "slide3_b",
      showWhen: { field: "steg", in: ["2"] },
      html: `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.3">Dags att ta din 30-dagarsbild</h2>
<p>Ta den på samma plats, i samma ljus och från samma vinkel som din första bild. Då blir jämförelsen rättvis.</p>
<p style="margin-bottom:0"><strong>Dina bilder är privata och används bara för att hjälpa dig följa din resa. Vi använder aldrig dina bilder i marknadsföring eller annan kommunikation utan ditt tydliga godkännande.</strong></p>`,
    },
    {
      kind: "info",
      key: "slide3_c",
      showWhen: { field: "steg", in: ["3"] },
      html: `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.3">Dags att ta din sista bild</h2>
<p>Det här är bild tre av tre. Ta den på samma plats, i samma ljus och från samma vinkel som de förra, så ser du hela din 60-dagarsresa sida vid sida.</p>
<p style="margin-bottom:0"><strong>Dina bilder är privata och används bara för att hjälpa dig följa din resa. Vi använder aldrig dina bilder i marknadsföring eller annan kommunikation utan ditt tydliga godkännande.</strong></p>`,
    },
    {
      kind: "file",
      key: "bild",
      label: "Välj en bild eller dra den hit",
      required: true,
      accept: "image/*",
      maxFiles: 1,
    },
  ],
  endings: {
    // --- Slide 4 ---
    success: {
      title: "Klart!",
      // Specen skriver "Din första bild" - den beskriver första uppladdningen.
      // Samma ending visas vid alla tre, och en ending kan inte villkoras, så
      // ordet "första" är borttaget. Resten är ordagrant.
      html: `<p>Din bild är på väg till din inkorg.</p><p style="opacity:.75">Det kan ta några minuter.</p>`,
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
