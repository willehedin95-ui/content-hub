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
  // INGEN helpdesk-leverans. En progressbild är inte en supportfråga; med
  // helpdesk fick kunden ett "vi återkommer inom 24 timmar" som ingen tänker
  // svara på, och kundservice hade fått tre ärenden per deltagare.
  // Inskickningen sparas och syns i /forms som förut. Byts till "klaviyo" när
  // adaptern finns - det är den som ska trigga mailen.
  delivery: "none",
  // Fullskärms onboarding i stället för formulär i en vit ruta. Färgerna är
  // Envanas tokens ur designsystemet i Figma (brand/500, bg/base,
  // text/heading, text/muted), inte valda på känsla.
  theme: {
    mode: "app",
    brand: "#f0573d",
    bg: "#fefaf8",
    surface: "#ffffff",
    text: "#320d01",
    muted: "#7e6458",
  },
  fields: [
    // Bars av lanken: ?steg=1|2|3. Utan parameter antas forsta bilden.
    { kind: "hidden", key: "steg", label: "Steg", fromParam: "steg", fallback: "1" },

    // Tre korta steg med app-onboarding-anatomi: bildblock overst, tat
    // textklump under, en sak per skarm. Monstret och proportionerna ar tagna
    // fran Ember/Weightless-onboardingen (SlideMetrics.artHeight = 40% av
    // skarmhojden) dar de redan ar provade. Ingen skarm ska krava scroll.

    // --- Steg 1: e-post ---
    {
      kind: "info",
      key: "art_epost",
      html: `<div class="chf-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z"/><path d="M3.4 7.2 12 13l8.6-5.8"/></svg></div><h2 class="chf-slide-title">Vi börjar med din e-post</h2>
<p class="chf-slide-sub">Vi kopplar dina bilder till dig och påminner när det är dags för nästa.</p>`,
    },
    {
      kind: "email",
      key: "email",
      required: true,
      role: "email",
      fromParam: "e",
      placeholder: "din@epost.se",
    },
    { kind: "pagebreak", key: "till_tips", label: "Fortsätt" },

    // --- Steg 2: sa blir bilden bra. Rutnatet ar stegets bildblock. ---
    {
      kind: "info",
      key: "tips_rubrik",
      html: `<h2 class="chf-slide-title">Så blir bilden bra</h2>
<p class="chf-slide-sub">Följ tipsen så blir jämförelsen tydlig vid dag 30 och 60.</p>`,
    },
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
    { kind: "pagebreak", key: "till_bild", label: "Jag är redo" },

    // --- Steg 3: ta bilden. Uppladdningszonen ar stegets bildblock. ---
    {
      kind: "info",
      key: "rubrik_1",
      showWhen: { field: "steg", in: ["1"] },
      html: `<h2 class="chf-slide-title">Dags att ta din första bild</h2>`,
    },
    {
      kind: "info",
      key: "rubrik_2",
      showWhen: { field: "steg", in: ["2"] },
      html: `<h2 class="chf-slide-title">Dags att ta din 30-dagarsbild</h2>
<p class="chf-slide-sub">Samma plats, samma ljus, samma vinkel som första bilden.</p>`,
    },
    {
      kind: "info",
      key: "rubrik_3",
      showWhen: { field: "steg", in: ["3"] },
      html: `<h2 class="chf-slide-title">Dags att ta din sista bild</h2>
<p class="chf-slide-sub">Bild tre av tre. Sedan ser du hela din resa.</p>`,
    },
    {
      kind: "file",
      key: "bild",
      required: true,
      accept: "image/*",
      maxFiles: 1,
      placeholder: "Välj en bild",
    },
    {
      kind: "info",
      key: "integritet",
      // Ingen hardkodad gra: temats muted-variabel, annars driver raden ifran
      // resten av paletten sa fort ett formular byter farger.
      html: `<p style="margin:0;text-align:center;font-size:14px;color:var(--chf-muted,#666)">Bilderna är dina. Vi använder dem aldrig någon annanstans utan att fråga dig först.</p>`,
    },
  ],
  endings: {
    // --- Slide 4 ---
    // Varianter per steg. Samma text vid alla tre var direkt felaktig vid den
    // sista bilden: "vi hör av oss om 30 dagar" när serien just tagit slut.
    // Varje variant säger dessutom var i serien hon är - en påbörjad serie med
    // ett hål kvar är det som får henne tillbaka, starkare än belöningen.
    success: {
      title: "Klart!",
      html: `<p>Din bild är sparad.</p>`,
      variants: [
        {
          showWhen: { field: "steg", in: ["1"] },
          title: "Första bilden är inne",
          html: `<p><strong>1 av 3.</strong> Nästa bild tar du om 30 dagar.</p>
<p style="margin-top:14px">Titta efter naglarna och håret först. De svarar tidigare än huden, ofta redan innan du ser något i ansiktet.</p>
<p style="margin-top:14px">Vi hör av oss när det är dags. Ta Envana varje dag tills dess, det är det som avgör hur mycket du ser.</p>`,
        },
        {
          showWhen: { field: "steg", in: ["2"] },
          title: "Halvvägs",
          html: `<p><strong>2 av 3.</strong> En bild kvar.</p>
<p style="margin-top:14px">Det är nu det börjar hända. Mellan dag 30 och dag 60 är förändringen som störst, och den sista bilden är den som visar den.</p>
<p style="margin-top:14px">Vi hör av oss om 30 dagar.</p>`,
        },
        {
          showWhen: { field: "steg", in: ["3"] },
          title: "Din resa är klar",
          html: `<p><strong>3 av 3.</strong> Du har dokumenterat 60 dagar.</p>
<p style="margin-top:14px">Vi mejlar hela din serie, alla tre bilderna bredvid varandra, tillsammans med dina 200 kr som tack.</p>`,
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
