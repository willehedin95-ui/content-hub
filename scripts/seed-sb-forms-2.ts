/**
 * Phase 3, batch 2 for SwedishBalance (happysleep workspace):
 *   se/angerratt, dk/angerratt, dk/kontakt
 *
 * Texts ported 1:1 from the Fillout forms (read 2026-09-14 from the public
 * __NEXT_DATA__ of forms.swedishbalance.se/t/<id>):
 *   SE Ångerrätt EU  2NeEZQU9dous
 *   DK Ångerrätt EU  eeU1WvFZv7us
 *   DK Kontakta oss  cCndUUcxoHus
 *
 * Ångerrätt is the statutory right of withdrawal (EU 2023/2673). Deliberately:
 *  - TWO steps, matching the directive's separate confirmation (pagebreak).
 *  - NO date gate. A statutory withdrawal must always be accepted; the old
 *    bridge excluded "anger" from the 14-day window for the same reason.
 *  - Priority 3 (High) - often must be actioned before the order ships. Same
 *    value the Fillout bridge used for formKind "anger".
 *  - The confirmation step names the order and e-mail via {{key}} so the
 *    customer sees WHAT they are withdrawing from before confirming.
 *
 * Fixes vs the Fillout originals (see content-hub-forms.md):
 *  - DK kontakt: the hide conditions were written against the SWEDISH answer
 *    ("Jag vill returnera/reklamera en produkt") while the options are Danish,
 *    so a Danish customer choosing "Jeg vil returnere/klage over et produkt"
 *    still saw the whole contact form instead of only the pointer to the
 *    return form. Rewired to the Danish answers.
 *  - DK kontakt's thank-you page was Swedish. Now Danish.
 *
 * Idempotent: upserts on (workspace_id, slug, market).
 *
 *   npx tsx scripts/seed-sb-forms-2.ts
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

const HAPPYSLEEP_WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262";
const SE = "https://swedishbalance.se";
const DK = "https://swedishbalance.se/da-dk";

// ---------------------------------------------------------------------------
// 1. SE - Ångerrätt EU
// ---------------------------------------------------------------------------
const seAngerratt: FormConfig = {
  title: "Ångra ditt köp",
  intro: `<p>Här utövar du din lagstadgade ångerrätt och frånträder ditt köpeavtal. Du har 14 dagars ångerrätt från det att du tagit emot varan, och du kan ångra köpet redan innan varan har skickats. Det är kostnadsfritt och du behöver inte ange något skäl.</p><p>Fyll i uppgifterna nedan så bekräftar vi mottagandet via e-post.</p>`,
  submitLabel: "Jag bekräftar att jag ångrar avtalet",
  ticket: { kindLabel: "Ångerrätt", priority: 3, tags: ["anger"] },
  fields: [
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email", placeholder: "Den e-postadress du beställde med" },
    { kind: "text", key: "order_number", label: "Ordernummer", required: true, role: "order_number", help: "Står i din orderbekräftelse, t.ex. #12345" },
    // Statutory: no reason may be required.
    { kind: "textarea", key: "message", label: "Meddelande (valfritt)", required: false, role: "message" },

    { kind: "pagebreak", key: "step2", label: "Fortsätt" },

    {
      kind: "info",
      key: "confirm_intro",
      html: `<h3 style="margin:0 0 10px">Bekräfta att du ångrar avtalet</h3><p>Du är på väg att frånträda ditt köpeavtal för order {{order_number}}. När du klickar nedan registreras din ångerbegäran och vi skickar ett mottagningsbevis till {{email}}.</p>`,
    },
  ],
  endings: {
    success: {
      title: "Tack, vi har tagit emot din ångerbegäran",
      html: `<p>Din begäran är registrerad och ett mottagningsbevis är på väg till din e-post. Du behöver inte göra något mer just nu - vi återkommer med nästa steg.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 2. DK - Ångerrätt EU
// ---------------------------------------------------------------------------
const dkAngerratt: FormConfig = {
  title: "Fortryd dit køb",
  intro: `<p>Her kan du gøre brug af din lovbestemte fortrydelsesret og træde tilbage fra din købsaftale. Du har 14 dages fortrydelsesret fra den dag, du modtager varen, og du kan fortryde købet, allerede inden varen er sendt. Det er gratis, og du behøver ikke oplyse nogen grund.</p><p>Udfyld oplysningerne nedenfor, så bekræfter vi modtagelsen via e-mail.</p>`,
  submitLabel: "Jeg bekræfter, at jeg fortryder aftalen",
  ticket: { kindLabel: "Ångerrätt", priority: 3, tags: ["anger"] },
  fields: [
    { kind: "text", key: "first_name", label: "Fornavn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternavn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-mail-adresse", required: true, role: "email", placeholder: "Den e-mailadresse, du bestilte med" },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", required: true, role: "order_number", help: "Står i din ordrebekræftelse, f.eks. #12345" },
    { kind: "textarea", key: "message", label: "Besked (valgfrit)", required: false, role: "message" },

    { kind: "pagebreak", key: "step2", label: "Fortsæt" },

    {
      kind: "info",
      key: "confirm_intro",
      html: `<h3 style="margin:0 0 10px">Bekræft, at du fortryder aftalen</h3><p>Du er ved at træde tilbage fra din købsaftale for ordre {{order_number}}. Når du klikker nedenfor, registrerer vi din fortrydelse og sender en bekræftelse på modtagelsen til {{email}}.</p>`,
    },
  ],
  endings: {
    success: {
      title: "Tak, vi har modtaget din fortrydelse",
      html: `<p>Din fortrydelse er registreret, og en kvittering er på vej til din e-mail. Du behøver ikke gøre mere lige nu - vi kontakter dig med de næste trin.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 3. DK - Kontakta oss
// ---------------------------------------------------------------------------
// Same shape as se/kontakt: the "retur" topic hides the contact fields and only
// points at the return form. DK has no subscription topic.
const DK_CONTACT_TOPICS = [
  "paket",
  "andra_order",
  "orderbekraftelse",
  "bestallning",
  "klarna",
  "skadad",
  "rabatt",
  "produktfraga",
];

const dkKontakt: FormConfig = {
  submitLabel: "Send",
  ticket: { kindLabel: "Kontakt", priority: 1 },
  fields: [
    {
      kind: "info",
      key: "info_sprak",
      html: `<p>Bemærk venligst, at vores kundeservice svarer på svensk.</p>`,
    },
    {
      kind: "select",
      key: "topic",
      label: "Hvordan kan vi hjælpe dig?",
      required: true,
      placeholder: "Vælg et alternativ",
      options: [
        { value: "paket", label: "Hvor er min pakke?" },
        { value: "andra_order", label: "Jeg vil annullere/ændre min ordre" },
        { value: "retur", label: "Jeg vil returnere/klage over et produkt" },
        { value: "orderbekraftelse", label: "Min ordrebekræftelse er forsvundet" },
        { value: "bestallning", label: "Jeg har et spørgsmål om min ordre" },
        { value: "klarna", label: "Jeg har et spørgsmål om Klarna" },
        { value: "skadad", label: "Et produkt er gået i stykker under leveringen" },
        { value: "rabatt", label: "Jeg har et spørgsmål om rabatter/rabatkoder" },
        { value: "produktfraga", label: "Jeg har et spørgsmål om et produkt" },
      ],
    },

    {
      kind: "info",
      key: "info_paket",
      showWhen: { field: "topic", in: ["paket"] },
      html: `<p>Fra pakken er sendt fra os, tager det i øjeblikket 9-12 dage for levering på grund af højt tryk. Vi sætter pris på din forståelse og tålmodighed i denne periode med forlænget leveringstid.</p><p>Hvis du gerne vil spore din levering direkte, kan du gøre det ved at klikke på linket i din bekræftelsesmail eller på linket nedenfor:</p><p><a href="${DK}/a/spara-order" target="_blank" rel="noopener">${DK}/a/spara-order</a></p><p>Glem ikke at tjekke din spam, hvis du ikke kan finde bekræftelsesmailen - måske ligger den der og venter på dig!</p>`,
    },
    {
      kind: "info",
      key: "info_andra_order",
      showWhen: { field: "topic", in: ["andra_order"] },
      html: `<p>Desværre er det normalt ikke muligt at annullere eller ændre en ordre, der allerede er afgivet. Vores ordreflow er velorganiseret og involverer flere systemer, hvilket gør det vanskeligt at foretage ændringer bagefter.</p><p>Hvis ordren endnu ikke er afsendt, kan vi tilpasse den efter dine ønsker, så sørg for at kontakte os så hurtigt som muligt.</p><p>For mere information om vores vilkår og betingelser, læs mere her:</p><p><a href="${DK}/pages/leveransinfo" target="_blank" rel="noopener">${DK}/pages/leveransinfo</a></p>`,
    },
    {
      kind: "info",
      key: "info_retur",
      showWhen: { field: "topic", in: ["retur"] },
      html: `<p>Hvis du vil returnere/klage over et produkt, skal du bruge vores returformular. Klik på linket nedenfor for at få adgang til returformularen:</p><p><a href="${DK}/pages/returformular" target="_blank" rel="noopener"><strong>${DK}/pages/returformular</strong></a></p>`,
    },
    {
      kind: "info",
      key: "info_orderbekraftelse",
      showWhen: { field: "topic", in: ["orderbekraftelse"] },
      html: `<p>Har du dobbelttjekket din spam? Hvis ja, så fortsæt med at udfylde formularen, så hjælper vi dig!</p>`,
    },
    {
      kind: "info",
      key: "info_bestallning",
      showWhen: { field: "topic", in: ["bestallning"] },
      html: `<p>Har du tjekket, om du har fundet svaret på dit spørgsmål i vores <a href="https://support.swedishbalance.se/da-dk/support/solutions" target="_blank" rel="noopener">ofte stillede spørgsmål</a>?</p><p>Hvis ja, så fortsæt med at udfylde formularen, så hjælper vi dig!</p>`,
    },
    {
      kind: "info",
      key: "info_klarna",
      showWhen: { field: "topic", in: ["klarna"] },
      html: `<p>Når du har lagt en ordre hos os, vil dit køb være synligt for Klarna, vores betalingspartner. Via Klarnas hjemmeside eller deres app kan du nemt logge ind med BankID og få et overblik over alle dine køb.</p><p>Hvis du har specifikke spørgsmål til din faktura eller betaling, eller hvis du har brug for en specifik kvittering, anbefaler vi, at du kontakter Klarna direkte her:</p><p><a href="https://www.klarna.com/dk/kundeservice/" target="_blank" rel="noopener">https://www.klarna.com/dk/kundeservice/</a></p><p>Hvis forfaldsdatoen nærmer sig, og du ikke har modtaget din pakke, har du mulighed for at forlænge fakturaperioden ved at kontakte Klarna.</p><p>Du er selvfølgelig også velkommen til at kontakte vores kundeservice, hvis du har brug for yderligere hjælp eller har andre spørgsmål.</p>`,
    },
    {
      kind: "info",
      key: "info_skadad",
      showWhen: { field: "topic", in: ["skadad"] },
      html: `<p>Vi beklager at måtte meddele dig, at et af vores produkter er blevet beskadiget under forsendelsen. For at kunne hjælpe dig så nemt og hurtigt som muligt beder vi dig om at sende os et billede eller en video, der tydeligt viser skaden eller fejlen.</p><p>Udfyld venligst nedenstående formular, så vender vi tilbage til dig så hurtigt som muligt med en løsning!</p>`,
    },
    {
      kind: "info",
      key: "info_rabatt",
      showWhen: { field: "topic", in: ["rabatt"] },
      html: `<p>Har du et spørgsmål om en rabat- eller kuponkode? Hver kode har unikke betingelser, som f.eks. gyldighedsperiode eller et eventuelt minimumsbeløb, der kræves for at få rabatten.</p><p>Bemærk, at <strong><u>rabatkoder skal bruges, før et køb foretages</u></strong>, og <strong><u>ikke</u></strong> kan tilføjes efterfølgende.</p><p>Er der stadig noget, du undrer dig over? Send os en besked nedenfor, så hjælper vi dig gerne!</p>`,
    },

    { kind: "text", key: "first_name", label: "Fornavn", required: true, role: "first_name", showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
    { kind: "text", key: "last_name", label: "Efternavn", required: true, role: "last_name", showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
    { kind: "email", key: "email", label: "E-mail-adresse", required: true, role: "email", placeholder: "Din e-mail-adresse", showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", required: true, role: "order_number", placeholder: "12345", showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
    { kind: "textarea", key: "message", label: "Din meddelelse", required: true, role: "message", placeholder: "Fortæl os, hvordan vi kan hjælpe dig", showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
    { kind: "file", key: "attachment", label: "Upload billede (valgfrit)", required: false, help: "F.eks. fotobevis på ordrebekræftelse eller beskadiget produkt", accept: "image/*,video/*,application/pdf", maxFiles: 3, showWhen: { field: "topic", in: DK_CONTACT_TOPICS } },
  ],
  endings: {
    success: {
      title: "Tak for din besked!",
      html: `<p>Vi vender tilbage til dig hurtigst muligt.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const forms: Array<{ slug: string; market: string; name: string; config: FormConfig }> = [
    { slug: "angerratt", market: "se", name: "Ångerrätt EU (SwedishBalance SE)", config: seAngerratt },
    { slug: "angerratt", market: "dk", name: "Fortrydelsesret EU (SwedishBalance DK)", config: dkAngerratt },
    { slug: "kontakt", market: "dk", name: "Kontakt os (SwedishBalance DK)", config: dkKontakt },
  ];

  for (const f of forms) {
    const { error } = await supabase.from("forms").upsert(
      {
        workspace_id: HAPPYSLEEP_WORKSPACE_ID,
        slug: f.slug,
        market: f.market,
        name: f.name,
        status: "published",
        config: f.config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,slug,market" }
    );
    if (error) {
      console.error(`FAILED ${f.market}/${f.slug}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Seeded form: ${f.market}/${f.slug} (${f.name})`);
    }
  }
}

main();
