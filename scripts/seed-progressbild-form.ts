/**
 * Seedar progressbildsformuläret (hydro13 workspace, market SE).
 *
 * ETT formulär bär alla tre bilderna. Vilket steg det gäller kommer från
 * query-strängen på sidan formuläret ligger på (?steg=1|2|3) och fångas av
 * ett `hidden`-fält. Zooki har ett formulär per milstolpe och måste därför
 * hålla fyra kopior i synk; det slipper vi.
 *
 * Kunden skriver sin e-post EN gång, vid första bilden. Kortet i paketet är
 * tryckt och därmed identiskt för alla, så vi kan inte veta vem som skannar.
 * Efter första submission är identiteten känd och länkarna framåt bär den.
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

/** Meningen som gör att hon vågar ladda upp, och som förbereder
 *  samtyckesfrågan vid steg 3. Tagen från Zooki, översatt. */
const INTEGRITETSRAD = `<p style="font-size:13px;line-height:1.5;opacity:.8">Bilderna är till för din egen skull. Vi använder dem aldrig i marknadsföring eller någon annan kommunikation utan att fråga dig först.</p>`;

const progressbild: FormConfig = {
  intro: `<p>Ta en bild i samma ljus och från samma håll varje gång. Då blir jämförelsen rättvis, och du ser skillnader som spegeln missar.</p>`,
  submitLabel: "Skicka in min bild",
  ticket: { kindLabel: "Progressbild", priority: 1 },
  fields: [
    // Bärs av länken: ?steg=1|2|3. Utan parameter antas första bilden.
    { kind: "hidden", key: "steg", label: "Steg", fromParam: "steg", fallback: "1" },

    {
      kind: "email",
      key: "email",
      label: "Din e-postadress",
      required: true,
      role: "email",
      help: "Använd samma adress varje gång, så hamnar bilderna i samma serie.",
    },
    {
      kind: "file",
      key: "bild",
      label: "Din bild",
      required: true,
      accept: "image/*",
      maxFiles: 1,
    },
    { kind: "info", key: "integritet", html: INTEGRITETSRAD },

    {
      kind: "textarea",
      key: "noterat",
      label: "Har du märkt något? (valfritt)",
      role: "message",
      placeholder: "Naglar, hår, hud, energi, sömn ... vad som helst du lagt märke till.",
    },

    // --- Endast vid sista bilden: samtycke och egen bildtext ---
    {
      kind: "radio",
      key: "samtycke",
      label: "Får vi visa din före- och efterbild?",
      showWhen: { field: "steg", in: ["3"] },
      help: "Du kan ändra dig när som helst genom att höra av dig till oss.",
      options: [
        { value: "nej", label: "Nej, bilderna är bara mina" },
        { value: "anonymt", label: "Ja, men anonymt utan namn" },
        { value: "fornamn", label: "Ja, med mitt förnamn" },
        { value: "fornamn_alder", label: "Ja, med mitt förnamn och min ålder" },
      ],
    },
    {
      kind: "textarea",
      key: "bildtext",
      label: "Vill du säga något om din resa? (valfritt)",
      showWhen: { field: "samtycke", in: ["anonymt", "fornamn", "fornamn_alder"] },
      placeholder: "Dina egna ord säger mer än något vi kan skriva.",
    },
  ],
  endings: {
    success: {
      title: "Tack, din bild är sparad",
      html: `<p>Vi hör av oss när det är dags för nästa. Under tiden: ta den varje dag, det är det som avgör.</p>`,
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
