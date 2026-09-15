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
  submitLabel: "Skicka in",
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
    // --- Steg 1: hon har redan forttjanat sina 200 kr ---
    // Belöningen ar VILLKORSLOS och presenteras forst. Da ar nasta skarms
    // fraga ett erbjudande ovanpa nagot hon redan fatt, inte ett pris hon
    // maste betala med sina bilder for att fa. Det ar ocksa det som gor
    // samtycket giltigt: hon kan saga nej utan att forlora nagot.
    {
      kind: "info",
      key: "klart",
      html: `<figure class="chf-shot"><div class="chf-shot-frame"><img src="{{hub}}/images/progressbild/exempel-c.jpg" alt="Tva selfies av samma person med 60 dagars mellanrum" width="1100" height="614" loading="eager"><span class="chf-shot-tag chf-shot-tag--a">DAG 1</span><span class="chf-shot-tag chf-shot-tag--b">DAG 60</span></div><figcaption>Exempelbild. Din egen serie ligger i mejlet vi just skickat.</figcaption></figure>
<h2 class="chf-slide-title">Tre bilder, 60 dagar. Du är klar.</h2>
<p class="chf-slide-sub">Ditt presentkort på 200 kr är ditt, oavsett vad du svarar på nästa fråga.</p>
<div class="chf-reward"><svg viewBox="0 0 170 106" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Presentkort"><defs><linearGradient id="chfg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect x="1" y="1" width="168" height="104" rx="13" fill="#f0573d"/><rect x="1" y="1" width="168" height="104" rx="13" fill="url(#chfg3)"/><g fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"><text x="15" y="27" font-size="7.5" font-weight="700" letter-spacing="1.7" opacity=".9">PRESENTKORT</text><text x="15" y="66" font-size="30" font-weight="800" letter-spacing="-.5">200 kr</text><text x="15" y="88" font-size="8" font-weight="700" letter-spacing="2.6" opacity=".92">ENVANA</text></g><circle cx="146" cy="30" r="13" fill="#ffffff" opacity=".16"/><circle cx="152" cy="46" r="7" fill="#ffffff" opacity=".12"/></svg><div class="chf-reward-txt"><b>200 kr</b>På väg till din inkorg.</div></div>`,
    },
    { kind: "pagebreak", key: "till_fragan", label: "Fortsätt" },

    // --- Steg 2: fragan, som ETT ja eller inget ---
    // Trappan med fyra niváer ar borta. Fyra val gjorde ett ja till ett
    // formularbeslut. Nu ar det en kryssruta, och NIVAN utlases i stallet ur
    // om hon fyller i sitt fornamn: namn ifyllt = med namn, tomt = anonymt.
    // Samma information, noll extra val for henne.
    {
      kind: "info",
      key: "fraga",
      html: `<h2 class="chf-slide-title">Vill du dubbla det?</h2>
<p class="chf-slide-sub">Vi letar efter äkta före och efter från riktiga kunder. Säger du ja till att vi får visa dina bilder skickar vi 200 kr till.</p>
<div class="chf-reward"><svg viewBox="0 0 170 106" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Presentkort"><defs><linearGradient id="chfg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect x="1" y="1" width="168" height="104" rx="13" fill="#f0573d"/><rect x="1" y="1" width="168" height="104" rx="13" fill="url(#chfg3)"/><g fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"><text x="15" y="27" font-size="7.5" font-weight="700" letter-spacing="1.7" opacity=".9">PRESENTKORT</text><text x="15" y="66" font-size="30" font-weight="800" letter-spacing="-.5">200 kr</text><text x="15" y="88" font-size="8" font-weight="700" letter-spacing="2.6" opacity=".92">ENVANA</text></g><circle cx="146" cy="30" r="13" fill="#ffffff" opacity=".16"/><circle cx="152" cy="46" r="7" fill="#ffffff" opacity=".12"/></svg><div class="chf-reward-txt"><b>200 kr till</b>Skickas samma dag som du säger ja.</div></div>`,
    },
    {
      kind: "checkbox",
      key: "samtycke",
      label: "Ja, Envana får visa mina bilder",
      text: "I annonser, på sajten och i mejl. Du kan ändra dig när som helst och då tar vi bort dem.",
    },
    {
      kind: "text",
      key: "fornamn",
      label: "Ditt förnamn",
      help: "Lämnar du det tomt visas bilderna helt anonymt.",
      showWhen: { field: "samtycke", notEmpty: true },
      placeholder: "t.ex. Anna",
    },
    {
      kind: "textarea",
      key: "bildtext",
      label: "Vill du säga något om din resa?",
      showWhen: { field: "samtycke", notEmpty: true },
      placeholder: "Dina egna ord säger mer än något vi kan skriva.",
    },
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
      variants: [
        {
          showWhen: { field: "samtycke", notEmpty: true },
          title: "Tack, det betyder mycket",
          html: `<p>Båda presentkorten är på väg till din inkorg, 400 kr totalt.</p>
<p style="margin-top:14px">Ångrar du dig är det bara att mejla oss, så tar vi bort bilderna.</p>`,
        },
      ],
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
