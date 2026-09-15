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
      // En rad, inte sex. Originalet sa samma sak tva ganger ("privata och
      // anvands bara for din resa" + "anvands aldrig utan godkannande") och
      // sköt ner tipsen under fold. Kärnan ar loftet, inte formuleringen.
      html: `<p style="margin:0;font-size:.9em;color:#555">Bilderna är dina. Vi använder dem aldrig någon annanstans utan att fråga dig först.</p>`,
    },
    // Fyra tipskort i stallet for tva stycken brodtext. Samma fyra rad som
    // selfieguiden i Hydro13-appen, dar monstret redan ar provat: ikon, tva
    // ord, en rad. Hur man tar ett bra foto ar visuell information - som
    // lopande text blev den hoppad over, vilket ar precis vad vi inte har rad
    // med: samma ljus och vinkel ar det som avgor om tva bilder blir en
    // anvandbar fore och efter.
    {
      kind: "info",
      key: "tips",
      html: `<div class="chf-tips">
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg><b>Naturligt ljus</b><span>Stå nära ett fönster</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg><b>Samma plats</b><span>Helst samma rum varje gång</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 5.5h3"/></svg><b>Samma vinkel</b><span>Håll telefonen lika högt</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M8.8 14.5c.9 1.1 2 1.7 3.2 1.7s2.3-.6 3.2-1.7"/></svg><b>Ren hud</b><span>Utan makeup eller filter</span></div>
</div>
<p class="chf-avoid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2h.01"/></svg><span>Undvik direkt solljus, mörka rum och filter.</span></p>`,
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
