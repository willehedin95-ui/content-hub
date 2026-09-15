/**
 * Seedar samtyckesformuläret (hydro13 workspace, market SE).
 *
 * Egen sida enligt "Envana progress"-specen, skild från progressbildsformuläret.
 * Den ligger sist i resan: kunden har laddat upp alla tre bilderna och ser sin
 * egen 60-dagarsjämförelse. Först då frågar vi om rättigheterna, och det är
 * inskickningen här som triggar belöningen på 200 kr.
 *
 * Frågan är en trappa, inte ja eller nej. Fler säger ja till det lägsta steget
 * än till ett binärt ja, och ett anonymt before/after är fortfarande äkta.
 *
 * Samtyckesnivån sparas som eget fält (inte i fritext) så den går att filtrera
 * på, och den måste gå att återkalla: vi måste kunna hitta och radera en
 * specifik kunds bilder.
 *
 * Idempotent: upsertar på (workspace_id, slug, market).
 *
 *   npx tsx scripts/seed-samtycke-form.ts
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

const samtycke: FormConfig = {
  submitLabel: "Skicka in mitt svar",
  ticket: { kindLabel: "Samtycke bilder", priority: 1 },
  fields: [
    {
      kind: "info",
      key: "intro",
      html: `<h2 style="margin:0 0 10px;font-size:20px;line-height:1.3">Du har gjort hela resan</h2>
<p>Tre bilder, 60 dagar. Ditt presentkort på 200 kr är på väg till din inkorg oavsett vad du svarar här nedanför.</p>
<p style="margin-bottom:0">Vi skulle vilja fråga en sak till: får vi visa din före- och efterbild för andra som funderar på samma resa?</p>`,
    },
    {
      kind: "email",
      key: "email",
      label: "Din e-postadress",
      required: true,
      role: "email",
      fromParam: "e",
      help: "Samma adress som du använde när du laddade upp dina bilder.",
    },
    {
      kind: "radio",
      key: "samtycke",
      label: "Får vi visa dina bilder?",
      required: true,
      help: "Du kan ändra dig när som helst. Hör bara av dig till support@shopenvana.com så tar vi bort dem.",
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
      title: "Tack!",
      html: `<p>Ditt svar är registrerat och ditt presentkort är på väg till din inkorg.</p>`,
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
      slug: "samtycke",
      market: "se",
      name: "Samtycke bilder (Envana)",
      status: "published",
      config: samtycke,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,slug,market" }
  );

  if (error) {
    console.error("Kunde inte seeda samtycke:", error.message);
    process.exit(1);
  }
  console.log("OK: samtycke (se) seedad for hydro13");
}

main();
