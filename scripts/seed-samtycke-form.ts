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
  // Inget helpdesk-ärende, samma skäl som progressbild. Samtyckesnivån ska
  // läsas ur form_submissions och filtreras på, inte hanteras av en agent.
  delivery: "none",
  // Samma app-läge som progressbildsformuläret. Sidorna ligger i samma resa
  // och nås av samma kund - ett byte till vitt webbformulär i sista steget
  // hade läst som en annan avsändare precis när vi ber om rättigheterna.
  theme: {
    mode: "app",
    brand: "#f0573d",
    bg: "#fefaf8",
    surface: "#ffffff",
    text: "#320d01",
    muted: "#7e6458",
  },
  fields: [
    // Fragan ar rubriken. Tidigare lag den som faltlabel halvvags ner, under
    // fem stycken text, och skarmen last som en vagg i stallet for ett val.
    {
      kind: "info",
      key: "intro",
      html: `<div class="chf-art chf-art-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.8"/><path d="M3.5 17.5 9 12.4l3.2 3 3-2.5 5.2 4.6"/></svg></div>
<h2 class="chf-slide-title">Får vi visa dina bilder?</h2>
<p class="chf-slide-sub">Tre bilder, 60 dagar. Du är klar. Ditt presentkort på 200 kr kommer oavsett vad du svarar.</p>`,
    },
    {
      kind: "radio",
      key: "samtycke",
      required: true,
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
      label: "Vill du säga något om din resa?",
      showWhen: { field: "samtycke", in: ["anonymt", "fornamn", "fornamn_alder"] },
      placeholder: "Dina egna ord säger mer än något vi kan skriva.",
    },
    // Forifylls fran lanken. Ligger sist for att den ar en teknikalitet, inte
    // det hon ar har for.
    {
      kind: "email",
      key: "email",
      label: "Din e-postadress",
      required: true,
      role: "email",
      fromParam: "e",
    },
    {
      kind: "info",
      key: "angra",
      html: `<p style="margin:0;font-size:14px;color:var(--chf-muted,#555)">Du kan ändra dig när som helst. Mejla <a href="mailto:support@shopenvana.com">support@shopenvana.com</a> så tar vi bort dem.</p>`,
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
