/**
 * Seeds the SwedishBalance support forms (happysleep workspace) for the
 * self-hosted form system, replacing the Fillout + Zapier chain:
 *   se/kontakt, se/retur, dk/retur
 *
 * Texts are ported 1:1 from the Fillout forms (read 2026-09-14 from the public
 * __NEXT_DATA__ of forms.swedishbalance.se/t/<id>):
 *   SE Kontakta oss   4C5CfWni9Gus
 *   SE Returformulär  brAmGUVG1sus
 *   DK Returformulär  4miJZsnPyeus
 *
 * Deliberate fixes vs the Fillout originals (see content-hub-forms.md):
 *  - DK retur: the conditions were written against the SWEDISH option labels
 *    while the options themselves are Danish, so the reklamation alert and the
 *    photo upload NEVER showed for Danish customers. Rewired to the Danish
 *    answers.
 *  - No date gate. The Fillout forms had none (a 55-day-old purchase went
 *    through on 2026-09-11), so adding one here would silently change policy.
 *    Add `dateGate: { maxDays: N }` once William decides the window.
 *
 * Idempotent: upserts on (workspace_id, slug, market).
 *
 *   npx tsx scripts/seed-sb-forms.ts
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
const DK = "https://swedishbalance.dk";

// ---------------------------------------------------------------------------
// 1. SE - Kontakta oss
// ---------------------------------------------------------------------------
// Fillout hides every contact field for two topics (retur + prenumeration):
// those two only show an info block pointing elsewhere. The hub config has
// showWhen (not hideWhen), so the eight remaining topics are listed explicitly.
const CONTACT_TOPICS = [
  "paket",
  "andra_order",
  "orderbekraftelse",
  "bestallning",
  "klarna",
  "skadad",
  "rabatt",
  "produktfraga",
];

const seKontakt: FormConfig = {
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Kontakt", priority: 1 },
  fields: [
    {
      kind: "select",
      key: "topic",
      label: "Hur kan vi hjälpa dig?",
      required: true,
      placeholder: "Välj ett alternativ",
      options: [
        { value: "paket", label: "Var är mitt paket?" },
        { value: "andra_order", label: "Jag vill avbryta/ändra min order" },
        { value: "retur", label: "Jag vill returnera/reklamera en produkt" },
        { value: "orderbekraftelse", label: "Min orderbekräftelse är borta" },
        { value: "bestallning", label: "Jag har en fråga om min beställning" },
        { value: "klarna", label: "Jag har en fråga om Klarna" },
        { value: "skadad", label: "En produkt har gått sönder i leveransen" },
        { value: "rabatt", label: "Jag har en fråga om rabatter/rabattkoder" },
        { value: "produktfraga", label: "Jag har en produktfråga" },
        { value: "prenumeration", label: "Jag vill ändra/avbryta min prenumeration" },
      ],
    },

    // --- Info-block per ämne (texterna 1:1 från Fillout) ---
    {
      kind: "info",
      key: "info_paket",
      showWhen: { field: "topic", in: ["paket"] },
      html: `<p>Från det att paketet skickats från oss tar det för närvarande 9-12 dagar för leverans på grund av högt tryck. Vi uppskattar din förståelse och tålamod under denna period med förlängda leveranstider.</p><p>Om du vill spåra din leverans direkt kan du göra det genom att klicka på länken i ditt bekräftelsemail eller på länken nedan:</p><p><a href="${SE}/a/spara-order" target="_blank" rel="noopener">${SE}/a/spara-order</a></p><p>Glöm inte att titta i din skräppost om du inte hittar bekräftelsemailet - det kan vara där och vänta på dig!</p>`,
    },
    {
      kind: "info",
      key: "info_andra_order",
      showWhen: { field: "topic", in: ["andra_order"] },
      html: `<p>Tyvärr är det vanligtvis inte möjligt att avbryta eller ändra en redan lagd order. Vårt orderflöde är välorganiserat och involverar flera system, vilket gör det svårt att göra ändringar i efterhand.</p><p>Om ordern ännu inte har skickats kan vi anpassa den enligt dina önskemål, så se till att kontakta oss snarast möjligt.</p><p>För mer information om våra villkor, vänligen läs mer här:</p><p><a href="${SE}/pages/leveransinfo" target="_blank" rel="noopener">${SE}/pages/leveransinfo</a></p>`,
    },
    {
      kind: "info",
      key: "info_retur",
      showWhen: { field: "topic", in: ["retur"] },
      html: `<p>Om du vill returnera/reklamera en produkt önskar vi att du använder vårt returformulär. Klicka på länken nedan för att komma till returformuläret:</p><p><a href="${SE}/pages/returformular" target="_blank" rel="noopener"><strong>${SE}/pages/returformular</strong></a></p>`,
    },
    {
      kind: "info",
      key: "info_orderbekraftelse",
      showWhen: { field: "topic", in: ["orderbekraftelse"] },
      html: `<p>Har du dubbelkollat i din skräppost? Om ja, fortsätt fyll i formuläret så hjälper vi dig!</p>`,
    },
    {
      kind: "info",
      key: "info_bestallning",
      showWhen: { field: "topic", in: ["bestallning"] },
      html: `<p>Har du kollat om du hittat svar på din fråga bland våra <a href="${SE}/pages/vanliga-fragor" target="_blank" rel="noopener">vanliga frågor?</a></p><p>Om ja, fortsätt fyll i formuläret så hjälper vi dig!</p>`,
    },
    {
      kind: "info",
      key: "info_klarna",
      showWhen: { field: "topic", in: ["klarna"] },
      html: `<p>När du har lagt en order hos oss kommer ditt köp att synas hos Klarna, vår betalpartner. Genom <a href="https://www.klarna.com/se/kundservice/" target="_blank" rel="noopener">Klarnas webbsida</a> eller deras app kan du enkelt logga in med BankID och få överblick över alla dina köp.</p><p>Om du har några specifika frågor gällande din faktura eller betalning, eller om du behöver ett specifikt kvitto, rekommenderar vi att du kontaktar Klarna direkt här:</p><p><a href="https://www.klarna.com/se/kundservice/" target="_blank" rel="noopener">https://www.klarna.com/se/kundservice/</a></p><p>Om förfallodagen närmar sig och du inte fått ditt paket har du möjlighet att förlänga fakturaperioden genom att kontakta Klarna.</p><p>Naturligtvis är du även välkommen att kontakta vår kundtjänst om du behöver fortsatt hjälp eller har andra frågor.</p>`,
    },
    {
      kind: "info",
      key: "info_skadad",
      showWhen: { field: "topic", in: ["skadad"] },
      html: `<p>Vi beklagar att en av våra produkter har skadats under frakten. För att vi ska kunna hjälpa dig så smidigt och snabbt som möjligt, ber vi dig vänligen att skicka med en bild eller video som tydligt visar skadan eller felet.</p><p>Vänligen fyll i formuläret nedan så återkommer vi snarast möjligt med en lösning!</p>`,
    },
    {
      kind: "info",
      key: "info_rabatt",
      showWhen: { field: "topic", in: ["rabatt"] },
      html: `<p>Undrar du något om en rabatt eller rabattkod? Varje kod har unika villkor, som till exempel giltighetstid eller eventuella krav på minsta orderbelopp för att få rabatten.</p><p>Observera att <strong><u>rabattkoder måste användas innan ett köp genomförs</u></strong> och kan <strong><u>inte</u></strong> läggas till i efterhand.</p><p>Är det fortfarande något du undrar över? Skicka ett meddelande till oss nedan så hjälper vi dig gärna!</p>`,
    },
    {
      kind: "info",
      key: "info_prenumeration",
      showWhen: { field: "topic", in: ["prenumeration"] },
      html: `<p>Du kan enkelt pausa, ändra eller avsluta din prenumeration via vår prenumerationsportal.</p><p>Klicka på länken nedan och ange din e-postadress (samma som vid beställning). Du får då en inloggningslänk skickad till din mejl.</p><p>👉 <a href="${SE}/apps/subscriptions" target="_blank" rel="noopener"><strong>Gå till prenumerationsportalen</strong></a></p>`,
    },

    // --- Kontaktfälten (dolda för retur + prenumeration, som i Fillout) ---
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name", showWhen: { field: "topic", in: CONTACT_TOPICS } },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name", showWhen: { field: "topic", in: CONTACT_TOPICS } },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email", placeholder: "Din e-postadress", showWhen: { field: "topic", in: CONTACT_TOPICS } },
    { kind: "text", key: "order_number", label: "Ordernummer", required: true, role: "order_number", placeholder: "Ex. 12345", showWhen: { field: "topic", in: CONTACT_TOPICS } },
    { kind: "textarea", key: "message", label: "Ditt meddelande", required: true, role: "message", placeholder: "Berätta hur vi kan hjälpa dig", showWhen: { field: "topic", in: CONTACT_TOPICS } },
    { kind: "file", key: "attachment", label: "Ladda upp bild (frivilligt)", required: false, help: "T.ex. bildbevis på orderbekräftelse eller skadad produkt", accept: "image/*,video/*,application/pdf", maxFiles: 3, showWhen: { field: "topic", in: CONTACT_TOPICS } },
  ],
  endings: {
    success: {
      title: "Tack för ditt meddelande!",
      html: `<p>Vi kommer att svara dig så snart vi kan.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 2. SE - Returformulär
// ---------------------------------------------------------------------------
const seRetur: FormConfig = {
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Retur", priority: 1 },
  fields: [
    {
      kind: "radio",
      key: "is_collagen",
      label: "Gäller din retur kosttillskott / kollagen?",
      required: true,
      options: [
        { value: "ja", label: "Ja" },
        { value: "nej", label: "Nej" },
      ],
    },
    {
      kind: "info",
      key: "info_hydro13",
      showWhen: { field: "is_collagen", in: ["ja"] },
      html: `<p><strong>Viktigt gällande Hydro13</strong></p><p>Öppnade flaskor kan inte returneras av hälso- och hygienskäl. Oöppnade flaskor kan endast returneras inom 14 dagar från leverans. Vill du istället utnyttja vår 60 dagars resultatgaranti kan du läsa mer här:</p><p>👉 <a href="${SE}/pages/garanti-hydro13" target="_blank" rel="noopener">${SE}/pages/garanti-hydro13</a></p>`,
    },
    {
      kind: "info",
      key: "info_rek",
      html: `<p><strong>VIKTIGT:</strong> Returer måste skickas som vanligt paket, INTE som rekommenderat brev (REK).</p>`,
    },

    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email", placeholder: "Den e-postadress du beställde med" },
    { kind: "text", key: "order_number", label: "Ordernummer", required: true, role: "order_number", placeholder: "Ex. 12345" },
    { kind: "date", key: "purchase_date", label: "Datum för köpet", required: true, role: "delivery_date" },

    {
      kind: "textarea",
      key: "products",
      label: "Vilken/vilka produkt(er) vill du returnera?",
      required: true,
      showWhen: { field: "is_collagen", in: ["nej"] },
    },
    {
      kind: "select",
      key: "quantity",
      label: "Antal produkter du vill returnera",
      required: true,
      options: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    },
    {
      kind: "radio",
      key: "condition",
      label: "Vilket skick har produkten/produkterna?",
      required: true,
      options: [
        { value: "oanvand", label: "Oanvänd" },
        { value: "oppnad", label: "Öppnad/använd" },
        { value: "skadad", label: "Skadad" },
      ],
    },
    {
      kind: "radio",
      key: "reason",
      label: "Varför vill du returnera/reklamera?",
      required: true,
      role: "message",
      options: [
        { value: "trasig", label: "Produkten är trasig/fungerar inte som den ska" },
        { value: "fel_produkt", label: "Jag fick fel produkter i mitt paket" },
        { value: "avbryta", label: "Jag vill avbryta min order" },
        { value: "annat", label: "Annat" },
      ],
    },
    {
      kind: "info",
      key: "info_reklamation",
      showWhen: { field: "reason", in: ["trasig"] },
      html: `<p><strong>REKLAMATION</strong></p><p>För att vi ska kunna hjälpa dig behöver du bifoga en <strong>bild/video</strong> som visar skadan/felet.</p>`,
    },
    {
      kind: "info",
      key: "info_avbryta",
      showWhen: { field: "reason", in: ["avbryta"] },
      html: `<p><strong>AVBRYTA ORDER</strong></p><p>Du kan avboka en eller flera produkter, förutom nedladdningsbara böcker, fram tills dess att beställningen är packad.</p><p>Om din beställning redan har skickats måste du göra en retur när beställningen har mottagits. Du kommer att få en bekräftelse via e-post ifall din order har avbrutits.</p><p>Om du inte får någon bekräftelse på att din order är avbruten innebär det att din beställning redan är packad och redo för leverans. I detta fall måste du vänta tills du får paketet för att sedan göra en vanlig retur.</p>`,
    },
    {
      kind: "textarea",
      key: "reason_details",
      label: "Berätta mer om varför du vill returnera",
      required: false,
    },
    {
      kind: "file",
      key: "attachment",
      label: "Ladda upp bild/video",
      required: false,
      help: "T.ex. bildbevis på orderbekräftelse eller skadad produkt",
      accept: "image/*,video/*,application/pdf",
      maxFiles: 3,
      showWhen: { field: "reason", in: ["trasig", "fel_produkt"] },
    },
    {
      kind: "checkbox",
      key: "confirm",
      label: "Jag godkänner",
      text: "Jag har läst och godkänner villkoren för retur.",
      required: true,
    },
    {
      kind: "info",
      key: "info_klimatsmart",
      showWhen: { field: "is_collagen", in: ["nej"] },
      html: `<h4><strong>🌱 Klimatsmart lösning</strong></h4><p>För att minimera onödiga returer och transporter och i hopp om att produkten ska komma till användning erbjuder vi nu ett alternativ där <em>du kan behålla produkten och få tillbaka 50% av priset.</em></p><p>På detta sätt hoppas vi att produkten kan vara till glädje och nytta för dig eller någon i din närhet, eller kanske bidra som en gåva till välgörande ändamål. Om du väljer detta alternativ kommer återbetalningen att ske inom 7 dagar.</p><p>Observera att garantin och reklamationsrätten upphör om detta alternativ väljs.</p>`,
    },
    {
      kind: "radio",
      key: "solution",
      label: "Välj alternativ",
      required: true,
      showWhen: { field: "is_collagen", in: ["nej"] },
      options: [
        { value: "klimatsmart", label: "Klimatsmart lösning" },
        { value: "returnera_sjalv", label: "Returnera själv" },
      ],
    },
  ],
  endings: {
    success: {
      title: "Tack för ditt meddelande!",
      html: `<p>Vi kommer att svara dig så snart vi kan.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 3. DK - Returformulär
// ---------------------------------------------------------------------------
// The Fillout original gates the reklamation alert and the file upload on the
// SWEDISH answer labels while the options are Danish - so they never fired.
// Here they are wired to the Danish answers.
const dkRetur: FormConfig = {
  submitLabel: "Send",
  ticket: { kindLabel: "Retur", priority: 1 },
  fields: [
    {
      kind: "info",
      key: "info_rek",
      html: `<p><strong>VIGTIGT:</strong> Returneringer skal sendes som almindelig pakke, IKKE som anbefalet brev.</p>`,
    },
    { kind: "text", key: "first_name", label: "Fornavn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternavn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-mail-adresse", required: true, role: "email", placeholder: "Den e-mailadresse, du bestilte med" },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", required: true, role: "order_number", placeholder: "12345" },
    { kind: "date", key: "purchase_date", label: "Dato for køb", required: true, role: "delivery_date" },
    { kind: "textarea", key: "products", label: "Hvilke(t) produkt(er) ønsker du at returnere?", required: true },
    {
      kind: "select",
      key: "quantity",
      label: "Antal produkter, du vil returnere",
      required: true,
      options: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    },
    {
      kind: "radio",
      key: "condition",
      label: "Hvad er produktets/produkternes tilstand?",
      required: true,
      options: [
        { value: "ubrugt", label: "Ubrugt" },
        { value: "brugt", label: "Åbnet/brugt" },
        { value: "beskadiget", label: "Beskadiget" },
      ],
    },
    {
      kind: "radio",
      key: "reason",
      label: "Hvorfor vil du returnere/klage?",
      required: true,
      role: "message",
      options: [
        { value: "trasig", label: "Produktet er i stykker/virker ikke ordentligt" },
        { value: "angret", label: "Jeg har annulleret mit køb og ønsker at returnere det." },
        { value: "fel_produkt", label: "Jeg modtog de forkerte produkter i min pakke" },
        { value: "avbryta", label: "Jeg ønsker at annullere min ordre" },
      ],
    },
    {
      kind: "info",
      key: "info_reklamation",
      showWhen: { field: "reason", in: ["trasig"] },
      html: `<p><strong>REKLAMATION</strong></p><p>For at vi kan hjælpe dig, skal du vedhæfte et <strong>billede/en video</strong>, der viser skaden/fejlen.</p>`,
    },
    {
      kind: "info",
      key: "info_avbryta",
      showWhen: { field: "reason", in: ["avbryta"] },
      html: `<p><strong>ANNULLER ORDRE</strong></p><p>Du kan annullere et eller flere produkter, indtil bestillingen er pakket.</p><p>Hvis din bestilling allerede er afsendt, skal du oprette en returnering, når du har modtaget den. Du får en bekræftelse på e-mail, hvis din ordre er blevet annulleret.</p><p>Hvis du ikke modtager en bekræftelse, betyder det at bestillingen allerede er pakket og klar til levering. I så fald skal du vente, til du får pakken, og derefter oprette en almindelig returnering.</p>`,
    },
    {
      kind: "textarea",
      key: "reason_details",
      label: "Fortæl gerne mere om årsagen",
      required: false,
    },
    {
      kind: "file",
      key: "attachment",
      label: "Upload billede/video",
      required: false,
      help: "F.eks. fotobevis på ordrebekræftelse eller beskadiget produkt",
      accept: "image/*,video/*,application/pdf",
      maxFiles: 3,
      showWhen: { field: "reason", in: ["trasig", "fel_produkt"] },
    },
    {
      kind: "checkbox",
      key: "confirm",
      label: "Jeg accepterer",
      text: "Jeg har læst og accepterer betingelserne for returnering.",
      required: true,
    },
    {
      kind: "info",
      key: "info_klimatsmart",
      html: `<h4><strong>🌱 Klimasmart løsning</strong></h4><p>For at minimere unødvendig returnering og transport og i håb om, at produktet bliver brugt, tilbyder vi nu en mulighed, hvor du kan beholde produktet og <em><u>få 50% af prisen tilbage.</u></em></p><p>På den måde håber vi, at produktet kan blive til glæde og gavn for dig eller en, der står dig nær, eller måske bidrage som gave til velgørenhed. Hvis du vælger denne mulighed, vil tilbagebetalingen ske inden for 7 dage.</p><p>Bemærk, at garantien og reklamationsretten bortfalder, hvis du vælger denne mulighed.</p>`,
    },
    {
      kind: "radio",
      key: "solution",
      label: "Vælg mulighed",
      required: true,
      options: [
        { value: "klimatsmart", label: "Klimasmart løsning" },
        { value: "returnera_sjalv", label: "Send selv pakken retur" },
      ],
    },
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
    { slug: "kontakt", market: "se", name: "Kontakta oss (SwedishBalance SE)", config: seKontakt },
    { slug: "retur", market: "se", name: "Returformulär (SwedishBalance SE)", config: seRetur },
    { slug: "retur", market: "dk", name: "Returformular (SwedishBalance DK)", config: dkRetur },
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

  // Helpdesk routing for happysleep: Freshdesk, SwedishBalance account
  // (FRESHDESK_SB_DOMAIN / FRESHDESK_SB_API_KEY -> swedishbalance-support).
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", HAPPYSLEEP_WORKSPACE_ID)
    .single();
  if (wsErr) {
    console.error(`FAILED reading workspace settings: ${wsErr.message}`);
    process.exitCode = 1;
    return;
  }
  const settings = (ws?.settings as Record<string, unknown>) ?? {};
  if (!settings.forms_helpdesk) {
    settings.forms_helpdesk = { type: "freshdesk", account: "sb" };
    const { error: updErr } = await supabase
      .from("workspaces")
      .update({ settings })
      .eq("id", HAPPYSLEEP_WORKSPACE_ID);
    if (updErr) {
      console.error(`FAILED setting forms_helpdesk: ${updErr.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Set workspaces.settings.forms_helpdesk = freshdesk/sb for happysleep`);
    }
  } else {
    console.log(`forms_helpdesk already set: ${JSON.stringify(settings.forms_helpdesk)}`);
  }
}

main();
