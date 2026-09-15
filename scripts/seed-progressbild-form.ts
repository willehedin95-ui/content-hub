/**
 * Seedar progressbildsformuläret (hydro13 workspace, market SE).
 *
 * Fyra skärmar: introkarusell, e-post, bilden, frågan. Femte är endingen.
 * Copy är tagen ordagrant ur "Envana progress"-specen.
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
  // Rakningen i knappen, inte bara pa skarmen. Uppmatt monster: Thea kor
  // "Take front photo (1/4)" och "(2/4)" - hon ser var i serien hon ar i
  // samma ogonblick som hon trycker.
  submitLabel: "Ladda upp bild {{steg}} av 3",
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

    // ------------------------------------------------------ INTROKARUSELL
    // ETT steg, tre paneler man swajpar mellan, med prickar och en knapp som
    // STAR STILL. Formen ar Weightless introCarousel
    // (app-venture/snowball/.../OnboardingModels.swift), dar William bad om
    // den 2026-08-26 med skalet "folk ska veta vad appen GOR innan de fyller i
    // uppgifter", och dar den i sin tur ar matt ur Mobbin: F1, Mercury, Cleo,
    // bunq, MyFitnessPal och Tabby bygger alla likadant. Tre SEPARATA steg med
    // varsin knapp var fel form - knappen ska inte flytta sig.
    //
    // COPYN ar Hydro13-appens egen, inte paditad. SelfiePromptSlide.swift har
    // redan "Se skillnaden med egna ogon", "Vi hjalper dig dokumentera resan"
    // och "Efter din forsta dos far du ta ett foto. Vid dag 30 och 60
    // paminner vi dig igen" - skrivet for exakt den har produkten och den har
    // kunden. Att skriva nytt hade betytt tva olika roster for samma sak.
    //
    // Nytta, inte funktion: varje panel svarar pa "vad far JAG ut av det".
    // Visas BARA for den som ar ny - den som kommer via en tokenlank vid dag
    // 30 ska inte laras om flodet igen.
    {
      kind: "info",
      key: "intro",
      showWhen: { field: "kund", isEmpty: true },
      html: `<div class="chf-carousel">
<div class="chf-panel">
<figure class="chf-shot"><div class="chf-shot-frame"><img src="{{hub}}/images/progressbild/intro-beforeafter.jpg" alt="Samma ansikte pa dag 0 och dag 60" width="720" height="720" loading="eager"><span class="chf-shot-tag chf-shot-tag--a">DAG 0</span><span class="chf-shot-tag chf-shot-tag--b">DAG 60</span></div></figure>
<h2 class="chf-slide-title">Se skillnaden</h2>
<p class="chf-slide-sub">Spegeln visar ingenting från en dag till nästa. Två bilder bredvid varandra gör det.</p>
</div>
<div class="chf-panel">
<figure class="chf-shot"><div class="chf-shot-frame"><img src="{{hub}}/images/progressbild/tidslinje.jpg" alt="En bild tagen idag och tva tomma rutor for dag 30 och dag 60" width="936" height="444" loading="eager"></div></figure>
<h2 class="chf-slide-title">Vi påminner dig</h2>
<p class="chf-slide-sub">Du tar ett foto idag. Vid dag 30 och 60 påminner vi dig igen, och visar din förra bild så du vet hur den togs.</p>
</div>
<div class="chf-panel">
<div class="chf-art chf-art-kort"><svg viewBox="0 0 170 106" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Presentkort pa 200 kronor"><defs><linearGradient id="chfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect x="1" y="1" width="168" height="104" rx="13" fill="#f0573d"/><rect x="1" y="1" width="168" height="104" rx="13" fill="url(#chfg)"/><g fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"><text x="15" y="27" font-size="7.5" font-weight="700" letter-spacing="1.7" opacity=".9">PRESENTKORT</text><text x="15" y="66" font-size="30" font-weight="800" letter-spacing="-.5">200 kr</text><text x="15" y="88" font-size="8" font-weight="700" letter-spacing="2.6" opacity=".92">ENVANA</text></g><circle cx="146" cy="30" r="13" fill="#ffffff" opacity=".16"/><circle cx="152" cy="46" r="7" fill="#ffffff" opacity=".12"/></svg></div>
<h2 class="chf-slide-title">200 kr när du är klar</h2>
<p class="chf-slide-sub">Presentkortet kommer när alla tre bilderna är inne.</p>
<div class="chf-reward"><span class="chf-reward-ikon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.3" width="15" height="10.2" rx="2.6"/><path d="M8 10.3V7.7a4 4 0 0 1 8 0v2.6"/><path d="M12 14.2v2.6"/></svg></span><div class="chf-reward-txt"><b>Bilderna är dina</b>Vi visar dem aldrig för någon utan att fråga dig först.</div></div>
</div>
</div>`,
    },
    { kind: "pagebreak", key: "till_epost", label: "Fortsätt" },

    // ---------------------------------------------------------------- STEG 2
    // E-post BARA nar vi inte redan vet vem hon ar. Kommer hon fran ett mail
    // bar lanken en signerad token, och da ar hela det har steget ett klick
    // som inte gor nagot. Hela steget forsvinner - embedden hoppar over steg
    // vars falt ar bortvillkorade.
    {
      kind: "info",
      key: "art_epost",
      showWhen: { field: "kund", isEmpty: true },
      html: `<h2 class="chf-slide-title">Vi börjar med din e-post</h2>
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
    { kind: "pagebreak", key: "till_bild", label: "Fortsätt" },

    // ------------------------------------------------ TA BILDEN (egen skarm)
    // EN skarm, EN knapp. Anatomin ar Theas (matningen i vaulten): ledtext med
    // feta nyckelord, en bild, och stegets CTA som oppnar valjaren.
    //
    // Har lag tidigare en hel tipsskarm med fyra ikonkort, en exempelbild OCH
    // en knapp som oppnade ett ratt/fel-rutnat i en modal - tre ytor som sa
    // samma sak om samma foto. William 2026-09-15: "det blir too much. Ta bort
    // alla tips och ta bort knappen for se exempel. Det racker att visa en bild
    // redan som exempel." Tipsskarmen, guide-knappen och modalen ar borta.
    //
    // "Rakt framifran" ar ocksa borta som krav. Vinkeln valjer hon sjalv, det
    // som spelar roll ar att den ar densamma nasta gang - vilket ar precis vad
    // hennes egen forra bild pa dag 30 och 60 visar.
    {
      kind: "info",
      key: "foto_lead_1",
      showWhen: { field: "steg", in: ["1"] },
      html: `<p class="chf-lead chf-hide-on-photo">Vi börjar med en bild på <b>hela ansiktet</b>. Se till att den inte är <b>suddig</b> och att <b>ljuset är bra</b>.</p>
<div class="chf-bigshot chf-hide-on-photo"><img src="{{hub}}/images/progressbild/exempel-bra.jpg" alt="Exempel på hur bilden ska se ut" width="491" height="613" loading="eager"><span class="chf-shot-tag chf-shot-tag--a">EXEMPEL</span></div>`,
    },
    // Dag 30 och 60: ledtexten och bilden ar SKILDA block med olika villkor.
    // Villkoren ar ett falt vardera (in / notEmpty), sa de gar inte att slaa
    // ihop - och kommer hon hit utan att vi hittat hennes forra bild ska
    // texten sta kvar anda.
    {
      kind: "info",
      key: "foto_lead_2",
      showWhen: { field: "steg", in: ["2", "3"] },
      html: `<p class="chf-lead chf-hide-on-photo">Dags för <b>bild {{steg}} av 3</b>. Ta den på <b>samma plats</b> och i <b>samma vinkel</b> som förra gången, så blir jämförelsen rättvis.</p>`,
    },
    {
      kind: "info",
      key: "forra_bilden",
      showWhen: { field: "forra_bild_url", notEmpty: true },
      html: `<div class="chf-bigshot chf-hide-on-photo"><img src="{{forra_bild_url}}" alt="Din förra bild"><span class="chf-shot-tag chf-shot-tag--a">DIN FÖRRA BILD</span></div>`,
    },
    // `asCta`: ingen egen knapp har. Stegets CTA heter "Ta bild", oppnar
    // systemets egen valjare (dar iOS sjalvt erbjuder kamera eller bibliotek)
    // och byter till "Fortsätt" nar bilden ar vald.
    {
      kind: "file",
      key: "bild",
      required: true,
      accept: "image/*",
      maxFiles: 1,
      asCta: true,
      ctaLabel: "Ta bild",
    },
    {
      kind: "info",
      key: "integritet",
      html: `<p class="chf-privacy">Bilderna är dina. Vi använder dem aldrig någon annanstans utan att fråga dig först.</p>`,
    },
    { kind: "pagebreak", key: "till_fraga", label: "Fortsätt" },

    // ------------------------------------------------- FRAGAN (egen skarm)
    // VAL, inte fritext. William: "Vad hoppas du pa ar vardelos. Ingen orkar
    // skriva fritext sa. Vi maste anvanda oss av olika val."
    //
    // Fragan och alternativen ar Hydro13-appens egna (PrimaryGoal i
    // UserProfile.swift), inte nyskrivna - hon har redan svarat pa den i
    // appen och kanner igen den.
    {
      kind: "info",
      key: "fraga_rubrik_1",
      showWhen: { field: "steg", in: ["1"] },
      html: `<h2 class="chf-slide-title">Vad vill du förbättra mest?</h2>
<p class="chf-slide-sub">Vi vet vad du ska titta efter, och när.</p>`,
    },
    {
      kind: "radio",
      key: "mal",
      showWhen: { field: "steg", in: ["1"] },
      options: [
        { value: "skin", label: "Hud och rynkor" },
        { value: "hair_nails", label: "Hår och naglar" },
        { value: "complete", label: "Hela kroppen" },
      ],
    },
    {
      kind: "info",
      key: "fraga_rubrik_2",
      showWhen: { field: "steg", in: ["2", "3"] },
      html: `<h2 class="chf-slide-title">Har du märkt någon skillnad?</h2>
<p class="chf-slide-sub">Det finns inget fel svar. Vi frågar för att veta vad som faktiskt händer.</p>`,
    },
    {
      kind: "radio",
      key: "markt",
      showWhen: { field: "steg", in: ["2", "3"] },
      options: [
        { value: "tydligt", label: "Ja, tydligt" },
        { value: "lite", label: "Ja, lite grann" },
        { value: "inte_an", label: "Inte än" },
        { value: "osaker", label: "Vet inte" },
      ],
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
