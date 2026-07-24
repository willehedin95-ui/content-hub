/**
 * Seeds the 4 Envana support forms (hydro13 workspace, market SE) for the
 * self-hosted form system, replacing the duplicated Fillout forms:
 *   kontakt, retur, garanti, angerratt
 *
 * Texts are ported 1:1 from the Fillout survey (2026-07-24) with
 * get-renew.com links swapped to shopenvana.com. Also sets
 * workspaces.settings.forms_helpdesk for hydro13 (Freshdesk, Renew account -
 * same account that receives Envana tickets today).
 *
 * Idempotent: upserts on (workspace_id, slug, market).
 *
 *   npx tsx scripts/seed-envana-forms.ts
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
const STORE = "https://shopenvana.com";
const PORTAL = `${STORE}/a/loop_subscriptions/customer`;

// ---------------------------------------------------------------------------
// 1. Kontakta oss
// ---------------------------------------------------------------------------
const kontakt: FormConfig = {
  intro: `<p>Vad roligt att du vill prata med oss! Fyll i formuläret så svarar vi dig så snabbt vi kan.</p>`,
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Kontakt", priority: 1 },
  fields: [
    {
      kind: "select",
      key: "topic",
      label: "Hur kan vi hjälpa dig?",
      required: true,
      options: [
        { value: "leverans", label: "Var är min leverans?" },
        { value: "andra_order", label: "Avbryta eller ändra min order" },
        { value: "retur", label: "Retur och ångerrätt" },
        { value: "ingen_bekraftelse", label: "Jag har inte fått orderbekräftelse" },
        { value: "faktura", label: "Fråga om faktura eller betalning (Klarna)" },
        { value: "rabatt", label: "Fråga om rabattkod" },
        { value: "pren_debiterad", label: "Jag har debiterats för en prenumeration" },
        { value: "pren_hantera", label: "Hantera min prenumeration" },
        { value: "garanti", label: "Fråga om resultatgarantin" },
        { value: "annat", label: "Annat" },
      ],
    },
    {
      kind: "info",
      key: "info_leverans",
      showWhen: { field: "topic", in: ["leverans"] },
      html: `<p>Dina varor skickas från vårt svenska lager och levereras normalt inom 1 till 3 arbetsdagar via Bring.</p><p><strong>Spåra din leverans:</strong></p><p>När din order har skickats får du ett leveransbekräftelsemejl med en spårningslänk. Du får också ett SMS från Bring där du kan följa paketet.</p><p><strong>Spåra direkt:</strong> Gå till <a href="https://tracking.bring.se/tracking" target="_blank" rel="noopener">Bring spårning</a> och ange ditt spårningsnummer.</p><p>Tips: Ladda ner Bring-appen för att följa ditt paket i realtid och hantera leveransen.</p><p>Har det gått mer än 5 arbetsdagar utan leverans? Fyll i formuläret nedan så hjälper vi dig.</p>`,
    },
    {
      kind: "info",
      key: "info_andra_order",
      showWhen: { field: "topic", in: ["andra_order"] },
      html: `<p>Tyvärr är det inte möjligt att avbryta eller ändra en redan lagd order. Vårt orderflöde är välorganiserat och involverar flera system, vilket gör det svårt att göra ändringar i efterhand.</p><p>Om ordern ännu inte har skickats kan vi försöka anpassa den enligt dina önskemål, så se till att kontakta oss snarast möjligt.</p><p>För mer information om våra villkor, vänligen läs mer här:</p><p><a href="${STORE}/pages/leverans-returer" target="_blank" rel="noopener">${STORE.replace("https://", "")}/pages/leverans-returer</a></p>`,
    },
    {
      kind: "info",
      key: "info_retur",
      showWhen: { field: "topic", in: ["retur"] },
      html: `<p>Du har 14 dagars ångerrätt från det att du mottagit din leverans. Oöppnade och förseglade flaskor kan returneras för full återbetalning.</p><p><strong>Viktigt att veta:</strong></p><p>Öppnade eller brutna förseglingar kan inte returneras enligt livsmedelslagstiftningen. Om du har öppnat produkten och inte är nöjd med resultatet kan du istället ansöka om vår <a href="${STORE}/pages/garanti-hydro13" target="_blank" rel="noopener">60 dagars resultatgaranti</a>.</p><p>Vill du returnera oöppnade flaskor? Fyll i vårt <a href="${STORE}/pages/returformular" target="_blank" rel="noopener">returformulär här</a></p>`,
    },
    {
      kind: "info",
      key: "info_ingen_bekraftelse",
      showWhen: { field: "topic", in: ["ingen_bekraftelse"] },
      html: `<p>Har du dubbelkollat i din skräppost? Om ja, fortsätt fyll i formuläret så hjälper vi dig!</p>`,
    },
    {
      kind: "info",
      key: "info_faktura",
      showWhen: { field: "topic", in: ["faktura"] },
      html: `<p>När du har lagt en order hos oss kommer ditt köp att synas hos Klarna, vår betalpartner. Genom <a href="https://www.klarna.com/se/kundservice/" target="_blank" rel="noopener">Klarnas webbsida</a> eller deras app kan du enkelt logga in med BankID och få överblick över alla dina köp.</p><p>Om du har några specifika frågor gällande din faktura eller betalning, eller om du behöver ett specifikt kvitto, rekommenderar vi att du kontaktar Klarna direkt här:</p><p><a href="https://www.klarna.com/se/kundservice/" target="_blank" rel="noopener">https://www.klarna.com/se/kundservice/</a></p><p>Om förfallodagen närmar sig och du inte fått ditt paket har du möjlighet att förlänga fakturaperioden genom att kontakta Klarna.</p><p>Naturligtvis är du även välkommen att kontakta vår kundtjänst om du behöver fortsatt hjälp eller har andra frågor.</p>`,
    },
    {
      kind: "info",
      key: "info_rabatt",
      showWhen: { field: "topic", in: ["rabatt"] },
      html: `<p>Undrar du något om en rabatt eller rabattkod? Varje kod har unika villkor, som till exempel giltighetstid eller eventuella krav på minsta orderbelopp för att få rabatten.</p><p>Observera att <strong>rabattkoder måste användas innan ett köp genomförs</strong> och kan <strong>inte</strong> läggas till i efterhand.</p><p>Är det fortfarande något du undrar över? Skicka ett meddelande till oss nedan så hjälper vi dig gärna!</p>`,
    },
    {
      kind: "info",
      key: "info_pren_debiterad",
      showWhen: { field: "topic", in: ["pren_debiterad"] },
      html: `<p>Om det har dragits pengar eller skapats en ny order automatiskt beror det på att du har en aktiv prenumeration. När du valde prenumerationspriset vid köptillfället ingick du ett avtal om återkommande leveranser. Detta framgår på produktsidan, i kassan och i våra <a href="${STORE}/pages/kopvillkor" target="_blank" rel="noopener">köpvillkor</a>.</p><p><strong>Vill du inte ha fler leveranser?</strong> Avsluta din prenumeration så att inga fler ordrar skapas:</p><ol><li><a href="${PORTAL}" target="_blank" rel="noopener">Klicka här för att gå till kundportalen</a></li><li>Skriv in din mejladress och klicka "Skicka inloggningslänk"</li><li>Kolla din mejl (och skräpposten) och klicka på länken</li><li>Klicka på din aktiva prenumeration och välj "Avbryt prenumeration"</li></ol><p><strong>Har en order redan skickats?</strong> Vi kan tyvärr inte stoppa en order som redan är på väg, men du kan returnera oöppnade produkter inom 14 dagar efter leverans. Läs mer i våra köpvillkor.</p><p>Behöver du hjälp? Fyll i formuläret nedan så återkommer vi inom 24 timmar.</p>`,
    },
    {
      kind: "info",
      key: "info_pren_hantera",
      showWhen: { field: "topic", in: ["pren_hantera"] },
      html: `<p>Du kan enkelt pausa, byta adress eller avsluta din prenumeration direkt via vår kundportal.</p><p><strong>Så här gör du:</strong></p><ol><li><a href="${PORTAL}" target="_blank" rel="noopener">Klicka här för att gå till kundportalen</a></li><li>Skriv in din mejladress och klicka "Skicka inloggningslänk"</li><li>Kolla din mejl (ibland skräpposten) och klicka på länken</li><li>Därifrån kan du pausa, ändra eller avsluta</li></ol><p>Kommer du inte åt portalen eller behöver du hjälp med något annat? Fyll i formuläret nedan så återkommer vi inom kort!</p>`,
    },
    {
      kind: "info",
      key: "info_garanti",
      showWhen: { field: "topic", in: ["garanti"] },
      html: `<p>Vi erbjuder 60 dagars resultatgaranti på Hydro13. Innan du ansöker behöver du läsa igenom garantivillkoren så att du vet vad som gäller och hur processen fungerar.</p><p><a href="${STORE}/pages/garanti-hydro13" target="_blank" rel="noopener">Läs garantivillkoren och fyll i ansökan här →</a></p><p>Har du frågor om garantin? Fyll i formuläret nedan.</p>`,
    },
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email" },
    { kind: "text", key: "order_number", label: "Ordernummer", role: "order_number" },
    { kind: "textarea", key: "message", label: "Ditt meddelande", required: true, role: "message" },
    {
      kind: "file",
      key: "image",
      label: "Ladda upp bild (frivilligt)",
      help: "T.ex. bildbevis på orderbekräftelse",
      maxFiles: 3,
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
// 2. Returformulär (datum-gate: max 14 dagar efter leverans)
// ---------------------------------------------------------------------------
const retur: FormConfig = {
  intro: `<p>Du har 14 dagars ångerrätt från det att du mottagit din leverans. Läs igenom informationen nedan innan du skickar in din ansökan.</p><p><strong>VIKTIGT INNAN DU RETURNERAR:</strong></p><ul><li>Endast oöppnade flaskor med intakt försegling accepteras</li><li>Du står för returfrakten och returen måste skickas spårbart</li><li>Skicka returen som vanligt paket, inte som rekommenderat brev</li><li>Skicka inte tillbaka produkter innan du fått returinstruktioner från oss</li></ul><p><strong>Har du öppnat flaskorna?</strong> Öppnade flaskor kan inte returneras. Om du har använt produkten och inte är nöjd kan du istället ansöka om vår <a href="${STORE}/pages/garanti-hydro13" target="_blank" rel="noopener">60 dagars resultatgaranti</a>.</p><p>För fullständig information, se våra <a href="${STORE}/pages/kopvillkor" target="_blank" rel="noopener">köpvillkor</a>.</p>`,
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Retur", priority: 1 },
  dateGate: { maxDays: 14 },
  fields: [
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email" },
    { kind: "text", key: "order_number", label: "Ordernummer", required: true, role: "order_number" },
    { kind: "date", key: "delivery_date", label: "När mottog du leveransen?", required: true, role: "delivery_date" },
    {
      kind: "select",
      key: "bottle_count",
      label: "Antal flaskor du vill returnera",
      required: true,
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "fler", label: "Fler än 3" },
      ],
    },
    { kind: "textarea", key: "reason", label: "Varför vill du returnera?", required: true, role: "message" },
    {
      kind: "checkbox",
      key: "confirm",
      label: "Jag godkänner",
      text: "Jag bekräftar att flaskorna är oöppnade med intakt försegling. Jag förstår att öppnade flaskor som skickas till lagret inte berättigar till återbetalning.",
      required: true,
    },
  ],
  endings: {
    success: {
      title: "Tack, vi har tagit emot din returansökan",
      html: `<p>En supportrepresentant granskar din ansökan och skickar returinstruktioner till din e-post (vanligtvis inom 48 timmar).</p><p>Skicka inte tillbaka några produkter innan du har fått instruktionerna från oss.</p>`,
    },
    too_late: {
      title: "Tyvärr har returfristen passerat",
      html: `<p>Det har gått mer än 14 dagar sedan du mottog din leverans, vilket innebär att ångerrätten tyvärr inte längre gäller.</p><p>Har du använt produkten utan önskat resultat? Då kan du istället ha rätt till vår <a href="${STORE}/pages/garanti-hydro13" target="_blank" rel="noopener">60 dagars resultatgaranti</a>.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 3. Kollagen-garanti (datum-gate: 60-90 dagar efter första leverans)
// ---------------------------------------------------------------------------
const garanti: FormConfig = {
  intro: `<p><strong>Hydro13 - Ansökan om 60 dagars resultatgaranti</strong></p><p>Har du använt Hydro13 dagligen i minst 60 dagar utan önskat resultat? Då kan du ansöka om full återbetalning för upp till 3 flaskor.</p><p><strong>Observera:</strong></p><ul><li>Garantin gäller vid daglig användning i minst 60 dagar (= minst 3 flaskor)</li><li>Ansökan måste göras inom 90 dagar från första leverans</li><li>Öppnade flaskor behöver inte returneras</li><li>Eventuell prenumeration måste pausas/avslutas innan ansökan</li></ul><p>Vi granskar din ansökan och återkommer inom 5 arbetsdagar.</p>`,
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Garanti", priority: 1 },
  dateGate: { minDays: 60, maxDays: 90 },
  fields: [
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email", placeholder: "Den e-postadress du beställde med" },
    { kind: "text", key: "order_number", label: "Ordernummer", required: true, role: "order_number", placeholder: "Ex. R1001" },
    {
      kind: "date",
      key: "first_delivery",
      label: "Datum för första leverans",
      required: true,
      role: "delivery_date",
      help: "Ungefärligt datum då du fick din allra första Hydro13-leverans",
    },
    {
      kind: "radio",
      key: "bottles_used",
      label: "Hur många flaskor har du använt?",
      required: true,
      options: [
        { value: "1", label: "1 flaska" },
        { value: "2", label: "2 flaskor" },
        { value: "3", label: "3 flaskor" },
        { value: "fler", label: "Fler än 3" },
      ],
    },
    {
      kind: "radio",
      key: "daily_usage",
      label: "Har du använt Hydro13 dagligen?",
      required: true,
      options: [
        { value: "ja", label: "Ja, varje dag" },
        { value: "nastan", label: "Nästan varje dag (missat enstaka dagar)" },
        { value: "nej", label: "Nej, jag har haft längre uppehåll" },
      ],
    },
    {
      kind: "radio",
      key: "goal",
      label: "Vad var ditt mål med Hydro13?",
      required: true,
      options: [
        { value: "hud", label: "Bättre hud (fasthet, elasticitet)" },
        { value: "rynkor", label: "Mindre rynkor/linjer" },
        { value: "har", label: "Starkare hår" },
        { value: "naglar", label: "Starkare naglar" },
        { value: "valmaende", label: "Generellt välmående" },
        { value: "annat", label: "Annat" },
      ],
    },
    {
      kind: "text",
      key: "goal_other",
      label: "Specificera ditt mål",
      required: true,
      showWhen: { field: "goal", in: ["annat"] },
    },
    {
      kind: "radio",
      key: "reason",
      label: "Varför vill du utnyttja garantin?",
      required: true,
      options: [
        { value: "inga_resultat", label: "Jag såg inga resultat alls" },
        { value: "for_lite", label: "Jag såg för lite resultat för tiden jag lade ner" },
        { value: "konsekvent", label: "Jag hade svårt att ta det konsekvent" },
        { value: "obehag", label: "Jag upplevde obehag (smak, magbesvär etc.)" },
        { value: "ekonomi", label: "Min ekonomi förändrades" },
        { value: "annat", label: "Annat" },
      ],
    },
    {
      kind: "text",
      key: "reason_other",
      label: "Specificera din anledning",
      required: true,
      showWhen: { field: "reason", in: ["annat"] },
    },
    { kind: "textarea", key: "story", label: "Berätta med dina egna ord", required: true, role: "message" },
    {
      kind: "radio",
      key: "active_subscription",
      label: "Har du en aktiv Hydro13-prenumeration?",
      required: true,
      options: [
        { value: "nej", label: "Nej" },
        { value: "ja", label: "Ja" },
      ],
    },
    {
      kind: "info",
      key: "info_pause_sub",
      showWhen: { field: "active_subscription", in: ["ja"] },
      html: `<p>Pausa eller avsluta din prenumeration innan du skickar in ansökan. Logga in på kundportalen genom att klicka <a href="${PORTAL}" target="_blank" rel="noopener">HÄR</a></p>`,
    },
    {
      kind: "checkbox",
      key: "confirm",
      label: "Jag godkänner",
      text: "Jag bekräftar att jag har använt Hydro13 dagligen i minst 60 dagar och att uppgifterna stämmer.",
      required: true,
    },
  ],
  endings: {
    success: {
      title: "Tack, vi har tagit emot din garantiansökan",
      html: `<p>Vi granskar din ansökan och återkommer till din e-post inom 5 arbetsdagar.</p>`,
    },
    too_early: {
      title: "Din ansökan är för tidig",
      html: `<p>Resultatgarantin gäller efter minst 60 dagars daglig användning, och det har inte gått 60 dagar sedan din första leverans ännu.</p><p>Fortsätt använda Hydro13 dagligen och återkom när 60 dagar har passerat - ansökan ska göras inom 90 dagar från första leveransen.</p>`,
    },
    too_late: {
      title: "Tyvärr har ansökningsfristen passerat",
      html: `<p>Ansökan om resultatgarantin måste göras inom 90 dagar från din första leverans, och den fristen har tyvärr passerat.</p><p>Har du frågor? <a href="${STORE}/pages/kontakta-oss" target="_blank" rel="noopener">Kontakta oss här</a>.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// 4. Ångerrätt EU (ingen datum-gate - lagstadgad begäran tas ALLTID emot)
// ---------------------------------------------------------------------------
const angerratt: FormConfig = {
  title: "Ångra ditt köp",
  intro: `<p>Här utövar du din lagstadgade ångerrätt och frånträder ditt köpeavtal. Du har 14 dagars ångerrätt från det att du tagit emot varan, och du kan ångra köpet redan innan varan har skickats. Det är kostnadsfritt och du behöver inte ange något skäl.</p><p>Fyll i uppgifterna nedan så bekräftar vi mottagandet via e-post.</p>`,
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Ångerrätt", priority: 3, tags: ["angerratt"] },
  fields: [
    { kind: "text", key: "first_name", label: "Förnamn", required: true, role: "first_name" },
    { kind: "text", key: "last_name", label: "Efternamn", required: true, role: "last_name" },
    { kind: "email", key: "email", label: "E-post", required: true, role: "email", placeholder: "Den e-postadress du beställde med" },
    {
      kind: "text",
      key: "order_number",
      label: "Ordernummer",
      required: true,
      role: "order_number",
      help: "Står i din orderbekräftelse, t.ex. #12345",
    },
    { kind: "textarea", key: "message", label: "Meddelande (valfritt)", role: "message" },
  ],
  endings: {
    success: {
      title: "Tack, vi har tagit emot din ångerbegäran",
      html: `<p>Din begäran är registrerad och ett mottagningsbevis är på väg till din e-post. Du behöver inte göra något mer just nu - vi återkommer med nästa steg.</p>`,
    },
  },
};

// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const forms: Array<{ slug: string; name: string; config: FormConfig }> = [
    { slug: "kontakt", name: "Kontakta oss (Envana)", config: kontakt },
    { slug: "retur", name: "Returformulär (Envana)", config: retur },
    { slug: "garanti", name: "Kollagen-garanti (Envana)", config: garanti },
    { slug: "angerratt", name: "Ångerrätt EU (Envana)", config: angerratt },
  ];

  for (const f of forms) {
    const { error } = await supabase.from("forms").upsert(
      {
        workspace_id: HYDRO13_WORKSPACE_ID,
        slug: f.slug,
        market: "se",
        name: f.name,
        status: "published",
        config: f.config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,slug,market" }
    );
    if (error) {
      console.error(`FAILED ${f.slug}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Seeded form: ${f.slug} (${f.name})`);
    }
  }

  // Helpdesk routing for hydro13: Freshdesk, Renew account (merge into settings)
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", HYDRO13_WORKSPACE_ID)
    .single();
  if (wsErr) {
    console.error(`FAILED reading workspace settings: ${wsErr.message}`);
    process.exitCode = 1;
    return;
  }
  const settings = (ws?.settings as Record<string, unknown>) ?? {};
  if (!settings.forms_helpdesk) {
    settings.forms_helpdesk = { type: "freshdesk", account: "renew" };
    const { error: updErr } = await supabase
      .from("workspaces")
      .update({ settings })
      .eq("id", HYDRO13_WORKSPACE_ID);
    if (updErr) {
      console.error(`FAILED setting forms_helpdesk: ${updErr.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Set workspaces.settings.forms_helpdesk = freshdesk/renew for hydro13`);
    }
  } else {
    console.log(`forms_helpdesk already set: ${JSON.stringify(settings.forms_helpdesk)}`);
  }
}

main();
