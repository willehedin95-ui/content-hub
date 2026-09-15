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
  // Klaviyo äger mailen. INGEN helpdesk: en progressbild är inte en
  // supportfråga, och med helpdesk fick kunden ett "vi återkommer inom 24
  // timmar" som ingen tänker svara på.
  //
  // `metric` är flödets trigger i Klaviyo. Ändra den ALDRIG efter att ett
  // flöde kopplats på den - ett flöde går inte att peka om via API:t
  // (se klaviyo-api-limits), så en ändring kräver att flödet byggs om.
  //
  // `seriesField: "steg"` gör att eventet även bär hennes tidigare bilder som
  // bild_1_url / bild_2_url / bild_3_url. Det är det som låter mailet visa
  // serien och de tomma rutorna, Zookis starkaste grepp.
  delivery: { type: "klaviyo", brand: "envana", metric: "Progressbild uppladdad", seriesField: "steg" },
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
    // Fylls av tokenuppslaget (?t=) i embedden, inte av kunden. Tomt = vi vet
    // inte vem hon ar, och da maste hon skriva sin adress.
    { kind: "hidden", key: "kund", label: "Kund" },
    { kind: "hidden", key: "forra_bild_url", label: "Förra bilden" },
    { kind: "hidden", key: "dagar_sedan_start", label: "Dagar sedan start" },

    // ---------------------------------------------------------------- STEG 1
    // Syftet. Kanner vi henne visar vi HENNES bild, annars exempelbilden.
    {
      kind: "info",
      key: "syfte_ny",
      showWhen: { field: "kund", isEmpty: true },
      html: `<figure class="chf-shot"><div class="chf-shot-frame"><img src="{{hub}}/images/progressbild/exempel-c.jpg" alt="Tva selfies av samma person med 60 dagars mellanrum" width="1100" height="614" loading="eager"><span class="chf-shot-tag chf-shot-tag--a">DAG 1</span><span class="chf-shot-tag chf-shot-tag--b">DAG 60</span></div><figcaption>Exempelbild. Om 60 dagar är det din egen serie du ser här.</figcaption></figure>
<h2 class="chf-slide-title">Så här ser 60 dagar ut</h2>
<p class="chf-slide-sub">Tre bilder: en idag, en om 30 dagar och en om 60. Sedan ser du din egen skillnad sida vid sida.</p>`,
    },
    {
      kind: "info",
      key: "belon_intro",
      showWhen: { field: "kund", isEmpty: true },
      html: `<div class="chf-reward"><svg viewBox="0 0 170 106" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Presentkort pa 200 kronor"><defs><linearGradient id="chfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect x="1" y="1" width="168" height="104" rx="13" fill="#f0573d"/><rect x="1" y="1" width="168" height="104" rx="13" fill="url(#chfg)"/><g fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"><text x="15" y="27" font-size="7.5" font-weight="700" letter-spacing="1.7" opacity=".9">PRESENTKORT</text><text x="15" y="66" font-size="30" font-weight="800" letter-spacing="-.5">200 kr</text><text x="15" y="88" font-size="8" font-weight="700" letter-spacing="2.6" opacity=".92">ENVANA</text></g><circle cx="146" cy="30" r="13" fill="#ffffff" opacity=".16"/><circle cx="152" cy="46" r="7" fill="#ffffff" opacity=".12"/></svg><div class="chf-reward-txt"><b>200 kr när alla tre är inne</b>Presentkortet kommer när du laddat upp bild tre. Bilderna är dina, vi visar dem aldrig för någon utan att fråga dig först.</div></div>`,
    },
    { kind: "pagebreak", key: "till_epost", label: "Jag börjar" },

    // ---------------------------------------------------------------- STEG 2
    // E-post BARA nar vi inte redan vet vem hon ar. Kommer hon fran ett mail
    // bar lanken en signerad token, och da ar hela det har steget ett klick
    // som inte gor nagot. Hela steget forsvinner - embedden hoppar over steg
    // vars falt ar bortvillkorade.
    {
      kind: "info",
      key: "art_epost",
      showWhen: { field: "kund", isEmpty: true },
      html: `<div class="chf-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z"/><path d="M3.4 7.2 12 13l8.6-5.8"/></svg></div><h2 class="chf-slide-title">Vi börjar med din e-post</h2>
<p class="chf-slide-sub">Vi kopplar dina bilder till dig och påminner när det är dags för nästa.</p>`,
    },
    {
      kind: "email",
      key: "email",
      required: true,
      role: "email",
      fromParam: "e",
      showWhen: { field: "kund", isEmpty: true },
      placeholder: "din@epost.se",
    },
    { kind: "pagebreak", key: "till_tips", label: "Fortsätt" },

    // ---------------------------------------------------------------- STEG 3
    // Fototipsen BARA vid forsta bilden. Vid bild tva och tre har hon redan
    // last dem, och da ar ratt instruktion "gor som forra gangen" - den star
    // bredvid uppladdningen i stallet, med hennes egen bild intill.
    {
      kind: "info",
      key: "tips_rubrik",
      showWhen: { field: "steg", in: ["1"] },
      html: `<h2 class="chf-slide-title">Så blir bilden bra</h2>
<p class="chf-slide-sub">En vanlig selfie på hela ansiktet, inte en närbild. Följ tipsen så blir jämförelsen tydlig vid dag 30 och 60.</p>`,
    },
    {
      kind: "info",
      key: "tips",
      showWhen: { field: "steg", in: ["1"] },
      html: `<div class="chf-tips">
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg><b>Naturligt ljus</b><span>Stå nära ett fönster</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg><b>Samma plats</b><span>Helst samma rum varje gång</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 5.5h3"/></svg><b>Samma vinkel</b><span>Håll telefonen lika högt</span></div>
<div class="chf-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M8.8 14.5c.9 1.1 2 1.7 3.2 1.7s2.3-.6 3.2-1.7"/></svg><b>Ren hud</b><span>Utan makeup eller filter</span></div>
</div>
<p class="chf-avoid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2h.01"/></svg><span>Undvik direkt solljus, mörka rum och filter.</span></p>`,
    },
    { kind: "pagebreak", key: "till_bild", label: "Jag är redo" },

    // ---------------------------------------------------------------- STEG 4
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
      html: `<h2 class="chf-slide-title">Dags för bild två</h2>`,
    },
    {
      kind: "info",
      key: "rubrik_3",
      showWhen: { field: "steg", in: ["3"] },
      html: `<h2 class="chf-slide-title">Sista bilden</h2>`,
    },
    // Hennes EGEN forra bild, direkt ovanfor uppladdningen. Det har ar den
    // basta vinkelguidning vi kan ge utan kamera i webblasaren: hon ser hur
    // bilden togs i stallet for att lasa om hur den borde tas.
    {
      kind: "info",
      key: "forra_bilden",
      showWhen: { field: "forra_bild_url", notEmpty: true },
      html: `<div class="chf-forra"><img src="{{forra_bild_url}}" alt="Din förra bild"><div class="chf-forra-txt"><b>Så här tog du den förra</b>Samma plats, samma ljus, håll telefonen lika högt.</div></div>`,
    },
    {
      kind: "info",
      key: "guide_knapp",
      html: `<button type="button" class="chf-guide-btn" data-chf-guide="{{hub}}/images/progressbild/exempel-ratt-fel.jpg" data-chf-guide-title="Så ska bilden se ut" data-chf-guide-text="Rakt framifrån, hela ansiktet i bild, i dagsljus eller en väl upplyst lampa. Tre av fyra misslyckade bilder är för mörka."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>Se exempel på en bra bild</button>`,
    },
    {
      kind: "file",
      key: "bild",
      required: true,
      accept: "image/*",
      maxFiles: 1,
      placeholder: "Välj en bild",
    },
    // Hennes egna ord. Ger HENNE nagot att titta efter och OSS en citatbank
    // som ar sann - hennes formuleringar blir battre annonscopy an vara.
    // Valfri med flit: ett obligatoriskt fritextfalt hade kostat uppladdningar.
    {
      kind: "textarea",
      key: "forvantan",
      showWhen: { field: "steg", in: ["1"] },
      label: "Vad hoppas du på?",
      placeholder: "Skriv en mening om vad du vill se förändras.",
    },
    {
      kind: "textarea",
      key: "markt",
      showWhen: { field: "steg", in: ["2", "3"] },
      label: "Har du märkt något?",
      placeholder: "Naglar, hår, hud, energi. Vad som helst du lagt märke till.",
    },
    {
      kind: "info",
      key: "integritet",
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
