/**
 * Åtgärdar allt som genomgången mot Fillout-originalen 2026-09-21 hittade,
 * plus bygger de formulär som saknades helt.
 *
 * Underlag: .claude/tasks/forms-fillout-diff-2026-09-21.md
 * Originalen lästes ur `forms.swedishbalance.se/t/<id>` (`__NEXT_DATA__`).
 *
 * Idempotent - kör om den hur många gånger som helst.
 *
 *   npx tsx scripts/fix-forms-2026-09-21.ts          (torrkörning, visar diff)
 *   npx tsx scripts/fix-forms-2026-09-21.ts --skarpt (skriver)
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

import { createClient } from "@supabase/supabase-js";
import type { FormConfig, FormField } from "../src/types/forms";

const HAPPYSLEEP = "c40221e2-96fb-4774-92db-74ec0227b262";
const HYDRO13 = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7";
const SKARPT = process.argv.includes("--skarpt");
// Flervalsfälten kräver den nya embedden. Se lagaEnvanaGaranti.
const FLERVAL = process.argv.includes("--flerval");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SE = "https://swedishbalance.se";
const NO = "https://swedishbalance.se/no-no";
const DK = "https://swedishbalance.se/da-dk";
const ENV = "https://shopenvana.com";

// ---------------------------------------------------------------------------
// Hjälpare: hitta ett fält, ändra det, rapportera
// ---------------------------------------------------------------------------
const logg: string[] = [];
function falt(cfg: FormConfig, key: string): FormField | undefined {
  return cfg.fields.find((f) => f.key === key);
}
function satt(cfg: FormConfig, key: string, patch: Record<string, unknown>, vad: string) {
  const f = falt(cfg, key) as Record<string, unknown> | undefined;
  if (!f) { logg.push(`   SAKNAS fältet ${key} (${vad})`); return; }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete f[k];
    else f[k] = v;
  }
  logg.push(`   ${key}: ${vad}`);
}

// ---------------------------------------------------------------------------
// 1. Befintliga formulär - punkterna 1-11 i rapporten
// ---------------------------------------------------------------------------
function lagaHappysleepKontakt(cfg: FormConfig, marknad: "se" | "dk") {
  // Punkt 6: introtexten som Fillout hade men seed-skriptet hoppade över.
  cfg.intro =
    marknad === "se"
      ? `<p>Vad roligt att du vill prata med oss! Fyll i formuläret så svarar vi dig så snabbt vi kan.</p>`
      : `<p>Vi er glade for, at du vil tale med os! Udfyld formularen, så vender vi tilbage til dig, så snart vi kan.</p>`;
  logg.push(`   intro: återställd från Fillout`);

  // Punkt 7: ordernummer var FRIVILLIGT i Fillout (required: false). En kund
  // som inte hittar sitt ordernummer ska inte stoppas av kontaktformuläret.
  satt(cfg, "order_number", { required: undefined }, "frivilligt igen (som i Fillout)");

  // Punkt 11: runtimen lägger själv till frivillig-markeringen.
  satt(
    cfg,
    marknad === "se" ? "attachment" : "attachment",
    { label: marknad === "se" ? "Ladda upp bild" : "Upload billede" },
    "dubbel frivillig-markering borta"
  );
}

function lagaHappysleepRetur(cfg: FormConfig, marknad: "se" | "dk") {
  // Punkt 6: två stycken ur Fillout, inklusive länken till returpolicyn.
  cfg.intro =
    marknad === "se"
      ? `<p>För att vara berättigad till retur måste varan vara i samma skick som du fick den, använd eller oanvänd, med etiketter och i originalförpackningen. Du behöver också kvittot eller bevis på köpet.</p>` +
        `<p>Använd den returadress som anges i returinstruktionerna. Du står för returfrakten och returen måste skickas med spårbart sändningsnummer. Varor som skickas tillbaka utan att först begära en retur kommer inte att accepteras. Efter att vi mottagit din ansökan kommer vi att granska den och återkomma med vårt beslut och ytterligare instruktioner.</p>` +
        `<p>För fullständig information, se vår <a href="${SE}/pages/returpolicy" target="_blank" rel="noopener">retur- och återbetalningspolicy</a>.</p>`
      : `<p>Vi tilbyder 30 dages fuld returret (60 dage på visse produkter). For at være berettiget til en returnering skal varen være i samme stand, som du modtog den, brugt eller ubrugt, med etiketter og i den originale emballage. Du skal også bruge kvittering eller købsbevis.</p>` +
        `<p>Brug den returadresse, der er angivet i returvejledningen. Du er ansvarlig for returforsendelsen, og returneringen skal sendes med et sporbart sporingsnummer. Varer, der returneres uden først at anmode om returnering, vil ikke blive accepteret. Når vi har modtaget din anmodning, gennemgår vi den og vender tilbage til dig med vores beslutning og yderligere instruktioner.</p>` +
        `<p>For alle detaljer, se venligst vores <a href="${DK}/pages/returpolicy" target="_blank" rel="noopener">politik for returnering og tilbagebetaling</a>.</p>`;
  logg.push(`   intro: återställd från Fillout, inkl. länk till returpolicyn`);

  // Punkt 5: bilden var OBLIGATORISK i Fillout när villkoret slog till.
  // Info-rutan säger "du behöver bifoga en bild" - utan required går det ändå
  // att skicka in, och ärendet fastnar i en extra runda med kunden.
  satt(cfg, "attachment", { required: true }, "obligatorisk vid reklamation igen");

  // Punkt 8: Fillouts ordalydelse. "Villkoren för retur" säger inte vad kunden
  // godkänner, och länken till villkoren fanns inte i formuläret.
  satt(
    cfg,
    "confirm",
    {
      text:
        marknad === "se"
          ? "Som kund godkänner du att du står för returfrakten och att returen skickas med ett spårbart sändningsnummer."
          : "Som kunde accepterer du, at du er ansvarlig for returforsendelsen, og at returneringen sendes med et sporbart sporingsnummer.",
    },
    "godkännandetexten tillbaka till Fillouts ordalydelse"
  );

  // Punkt 10: i Fillout dök klimatsmart-valet upp FÖRST när kunden bockat i
  // godkännandet (`isTrue(confirm)`), och på SE dessutom bara för icke-kollagen.
  // Hubben tappade bocken-villkoret: på DK visades valet direkt, på SE så fort
  // kunden svarat "nej" på kollagenfrågan.
  const visaEfterBock =
    marknad === "se"
      ? { all: [{ field: "confirm", notEmpty: true }, { field: "is_collagen", in: ["nej"] }] }
      : { field: "confirm", notEmpty: true };
  satt(cfg, "info_klimatsmart", { showWhen: visaEfterBock }, "visas först efter godkännandet");
  satt(cfg, "solution", { showWhen: visaEfterBock }, "visas först efter godkännandet");
}

function lagaHappysleepAngerratt(cfg: FormConfig, marknad: "se" | "dk") {
  satt(
    cfg,
    "message",
    { label: marknad === "se" ? "Meddelande" : "Besked" },
    "dubbel frivillig-markering borta"
  );
}

function lagaEnvanaKontakt(cfg: FormConfig) {
  // Punkt 16: sidan saknade rubrik helt - den började rakt i brödtext.
  cfg.title = "Kontakta oss";
  logg.push(`   title: "Kontakta oss"`);
  satt(cfg, "image", { label: "Ladda upp bild" }, "dubbel frivillig-markering borta");
  // Punkt 10: placeholders som fanns i Fillout.
  satt(cfg, "email", { placeholder: "Din e-postadress" }, "placeholder tillbaka");
  satt(cfg, "order_number", { placeholder: "Ex. R1001" }, "placeholder tillbaka");
  satt(cfg, "message", { placeholder: "Berätta hur vi kan hjälpa dig" }, "placeholder tillbaka");
}

function lagaEnvanaRetur(cfg: FormConfig) {
  cfg.title = "Returformulär";
  logg.push(`   title: "Returformulär"`);
  // Punkt 10: Fillout hade 1-6, inte "Fler än 3". En kund som returnerar fem
  // flaskor ska kunna säga fem.
  satt(
    cfg,
    "bottle_count",
    { options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) })) },
    "antal flaskor 1-6 som i Fillout"
  );
}

function lagaEnvanaGaranti(cfg: FormConfig) {
  // Envanas sidor har ingen rubrik i temat - formuläret bär den. Introts
  // första fetstil sa samma sak som rubriken, så den tas bort.
  cfg.title = "Ansökan om 60 dagars resultatgaranti";
  if (cfg.intro) cfg.intro = cfg.intro.replace(/^<p><strong>Collagen Formula - Ansökan om 60 dagars resultatgaranti<\/strong><\/p>/, "");
  logg.push(`   title: "Ansökan om 60 dagars resultatgaranti", dubblerad rubrik ur intro`);
  // Punkt 4: båda var Checkboxes (flerval) och FRIVILLIGA i Fillout.
  //
  // `checkboxes` är en NY fälttyp. Den embed som ligger ute renderar okända
  // typer som ett fritextfält, så configen får inte gå före deployen: kör med
  // --flerval FÖRST när den nya v1.js är live. Utan flaggan lämnas typen som
  // den är och bara required-flaggorna rättas.
  if (FLERVAL) {
    satt(cfg, "goal", { kind: "checkboxes", required: undefined }, "flerval igen, frivillig");
    satt(cfg, "reason", { kind: "checkboxes", required: undefined }, "flerval igen, frivillig");
  } else {
    satt(cfg, "goal", { kind: "radio", required: undefined }, "frivillig (flerval väntar på deploy)");
    satt(cfg, "reason", { kind: "radio", required: undefined }, "frivillig (flerval väntar på deploy)");
  }
  satt(cfg, "active_subscription", { required: undefined }, "frivillig igen (som i Fillout)");
}

function lagaEnvanaAngerratt(cfg: FormConfig) {
  satt(cfg, "message", { label: "Meddelande" }, "dubbel frivillig-markering borta");
  // Punkt 10: SwedishBalance taggar `anger`. En Freshdesk-regel som lyssnar på
  // den taggen missade Envana helt.
  cfg.ticket = { ...(cfg.ticket ?? {}), tags: ["anger"] };
  logg.push(`   ticket.tags: ["anger"] (samma som SwedishBalance)`);
  // Punkt 10: bekräftelsesteget sa inte VILKEN order kunden frånträder.
  satt(
    cfg,
    "confirm_info",
    {
      html:
        `<h2>Bekräfta att du ångrar avtalet</h2>` +
        `<p>Du är på väg att frånträda ditt köpeavtal för order {{order_number}}. När du klickar nedan registreras din ångerbegäran och vi skickar ett mottagningsbevis till {{email}}.</p>`,
    },
    "visar order och e-post som SwedishBalances gör"
  );
}

// ---------------------------------------------------------------------------
// 2. Nytt: SwedishBalances kollagengaranti (låg kvar på Fillout 9F7H4Zyfk3us)
// ---------------------------------------------------------------------------
const sbGaranti: FormConfig = {
  // Sidan `hydro13-claim` har `show_page_title: false` och ingen text-sektion,
  // så formulärets egen rubrik är sidans enda.
  title: "Hydro13 - Ansök om 60 dagars resultatgaranti",
  submitLabel: "Skicka in",
  ticket: { kindLabel: "Garanti", priority: 1 },
  dateGate: { minDays: 60, maxDays: 90 },
  intro:
    `<p>Har du använt Hydro13 dagligen i minst 60 dagar utan önskat resultat? Då kan du ansöka om full återbetalning för upp till 3 flaskor.</p>` +
    `<p><strong>Observera:</strong></p>` +
    `<ul><li>Garantin gäller vid daglig användning i minst 60 dagar (= minst 3 flaskor)</li>` +
    `<li>Ansökan måste göras inom 90 dagar från första leverans</li>` +
    `<li>Öppnade flaskor behöver inte returneras</li>` +
    `<li>Eventuell prenumeration måste pausas/avslutas innan ansökan</li></ul>` +
    `<p>Vi granskar din ansökan och återkommer inom 5 arbetsdagar.</p>`,
  fields: [
    { kind: "text", key: "first_name", label: "Förnamn", role: "first_name", required: true },
    { kind: "text", key: "last_name", label: "Efternamn", role: "last_name", required: true },
    { kind: "email", key: "email", label: "E-post", role: "email", required: true, placeholder: "Den e-postadress du beställde med" },
    { kind: "text", key: "order_number", label: "Ordernummer", role: "order_number", required: true, placeholder: "Ex. 12345" },
    {
      kind: "date", key: "first_delivery", label: "Datum för första leverans", role: "delivery_date", required: true,
      help: "Ungefärligt datum då du fick din allra första Hydro13-leverans",
    },
    {
      kind: "radio", key: "bottles_used", label: "Hur många flaskor har du använt?", required: true,
      options: [
        { value: "1", label: "1 flaska" },
        { value: "2", label: "2 flaskor" },
        { value: "3", label: "3 flaskor" },
        { value: "fler", label: "Fler än 3" },
      ],
    },
    {
      kind: "radio", key: "daily_usage", label: "Har du använt Hydro13 dagligen?", required: true,
      options: [
        { value: "ja", label: "Ja, varje dag" },
        { value: "nastan", label: "Nästan varje dag (missat enstaka dagar)" },
        { value: "nej", label: "Nej, jag har haft längre uppehåll" },
      ],
    },
    {
      kind: FLERVAL ? "checkboxes" : "radio", key: "goal", label: "Vad var ditt mål med Hydro13?",
      options: [
        { value: "hud", label: "Bättre hud (fasthet, elasticitet)" },
        { value: "rynkor", label: "Mindre rynkor/linjer" },
        { value: "har", label: "Starkare hår" },
        { value: "naglar", label: "Starkare naglar" },
        { value: "valmaende", label: "Generellt välmående" },
        { value: "annat", label: "Annat" },
      ],
    },
    { kind: "text", key: "goal_other", label: "Specificera ditt mål", required: true, showWhen: { field: "goal", in: ["annat"] } },
    {
      kind: FLERVAL ? "checkboxes" : "radio", key: "reason", label: "Varför vill du utnyttja garantin?",
      options: [
        { value: "inga_resultat", label: "Jag såg inga resultat alls" },
        { value: "for_lite", label: "Jag såg för lite resultat för tiden jag lade ner" },
        { value: "konsekvent", label: "Jag hade svårt att ta det konsekvent" },
        { value: "obehag", label: "Jag upplevde obehag (smak, magbesvär etc.)" },
        { value: "ekonomi", label: "Min ekonomi förändrades" },
        { value: "annat", label: "Annat" },
      ],
    },
    { kind: "text", key: "reason_other", label: "Specificera din anledning", required: true, showWhen: { field: "reason", in: ["annat"] } },
    {
      kind: "textarea", key: "story", label: "Berätta med dina egna ord", role: "message", required: true,
      placeholder: "Vad hoppades du på och vad upplevde du? Var ärlig, det hjälper oss bli bättre.",
    },
    {
      // Tre svar i SwedishBalances original, två i Envanas. Behålls som det är
      // - butikerna har olika prenumerationsportaler.
      kind: "radio", key: "active_subscription", label: "Har du en aktiv Hydro13-prenumeration?",
      options: [
        { value: "nej", label: "Nej" },
        { value: "pausad", label: "Ja, men den är pausad/avslutad" },
        { value: "aktiv", label: "Ja, den är fortfarande aktiv" },
      ],
    },
    {
      kind: "info", key: "info_pause_sub", showWhen: { field: "active_subscription", in: ["aktiv"] },
      html: `<p>Pausa eller avsluta din prenumeration innan du skickar in ansökan. <a href="${SE}/apps/subscriptions" target="_blank" rel="noopener">Logga in på prenumerationsportalen här</a>.</p>`,
    },
    {
      kind: "checkbox", key: "confirm", required: true,
      text: "Jag bekräftar att jag har använt Hydro13 dagligen i minst 60 dagar och att uppgifterna stämmer.",
    },
  ],
  endings: {
    success: {
      title: "Tack för din ansökan",
      html:
        `<p>Vi granskar ditt ärende och återkommer inom kort via e-post.</p>` +
        `<p>Om ansökan godkänns återbetalas beloppet för upp till 3 flaskor inom 10 arbetsdagar till samma betalningsmetod.</p>` +
        `<p>Frågor? kundservice@swedishbalance.se</p>`,
    },
    too_late: {
      title: "Ansökningstiden har passerat",
      html: `<p>Garantin måste utnyttjas inom 90 dagar från din första leverans. Kontakta oss på kundservice@swedishbalance.se om du har frågor.</p>`,
    },
    too_early: {
      title: "Det har inte gått 60 dagar ännu",
      html:
        `<p>Resultatgarantin kräver minst 60 dagars daglig användning. Ge din kropp den tid den behöver - kliniska studier visar att de tydligaste resultaten syns efter 8-10 veckor.</p>` +
        `<p>Kom tillbaka och ansök igen när det har gått minst 60 dagar sedan din första leverans.</p>`,
    },
  },
} as FormConfig;

// ---------------------------------------------------------------------------
// 3. Nytt: norska formulär. Marknaden /no-no är live men serverade svenska.
//    Kontaktformulärets copy är Fillouts egen norska (hRzSf12FGmus), med
//    villkoren omkopplade mot de NORSKA svaren - originalet pekade på de
//    svenska strängarna, samma bugg som DK hade.
// ---------------------------------------------------------------------------
const NO_KONTAKT_AMNEN = ["paket", "andra_order", "orderbekraftelse", "bestallning", "klarna", "skadad", "rabatt", "produktfraga"];

const noKontakt: FormConfig = {
  // INGEN `title`. SwedishBalances sidor bar sin rubrik i temats section-text,
  // och med bada blev det "Kontakt oss" tva ganger pa samma skarm. Uppmatt pa
  // /no-no/pages/returformular 2026-09-21. Envanas sidor har ingen temarubrik
  // och far darfor sin ur configen.
  submitLabel: "Send inn",
  ticket: { kindLabel: "Kontakt", priority: 1 },
  intro: `<p>Vi er glade for at du vil snakke med oss! Fyll ut skjemaet, så kommer vi tilbake til deg så snart vi kan.</p>`,
  fields: [
    {
      kind: "select", key: "topic", label: "Hvordan kan vi hjelpe deg?", required: true, placeholder: "Velg et alternativ",
      options: [
        { value: "paket", label: "Hvor er pakken min?" },
        { value: "andra_order", label: "Jeg ønsker å kansellere/endre bestillingen min" },
        { value: "retur", label: "Jeg ønsker å returnere/klage på et produkt" },
        { value: "orderbekraftelse", label: "Ordrebekreftelsen min er borte" },
        { value: "bestallning", label: "Jeg har et spørsmål om bestillingen min" },
        { value: "klarna", label: "Jeg har et spørsmål om Klarna" },
        { value: "skadad", label: "Et produkt har gått i stykker i leveransen" },
        { value: "rabatt", label: "Jeg har et spørsmål om rabatter/rabattkoder" },
        { value: "produktfraga", label: "Jeg har et spørsmål om et produkt" },
      ],
    },
    {
      kind: "info", key: "info_paket", showWhen: { field: "topic", in: ["paket"] },
      html:
        `<p>Fra pakken er sendt fra oss, tar det for tiden 9-12 dager for levering på grunn av høyt trykk. Vi setter pris på din forståelse og tålmodighet i denne perioden med forlenget leveringstid.</p>` +
        `<p>Hvis du ønsker å spore leveransen din direkte, kan du gjøre det ved å klikke på lenken i bekreftelses-e-posten din eller på lenken nedenfor:</p>` +
        `<p><a href="${NO}/a/spara-order" target="_blank" rel="noopener">Spor bestillingen din her</a></p>` +
        `<p>Ikke glem å sjekke søppelposten din hvis du ikke finner bekreftelses-e-posten - det kan hende den ligger der og venter på deg!</p>`,
    },
    {
      kind: "info", key: "info_andra_order", showWhen: { field: "topic", in: ["andra_order"] },
      html:
        `<p>Dessverre er det vanligvis ikke mulig å kansellere eller endre en bestilling som allerede er lagt inn. Ordreflyten vår er godt organisert og involverer flere systemer, noe som gjør det vanskelig å gjøre endringer i etterkant.</p>` +
        `<p>Hvis bestillingen ennå ikke er sendt, kan vi tilpasse den etter dine ønsker, så ta kontakt med oss så snart som mulig.</p>` +
        `<p>For mer informasjon om vilkårene våre, <a href="${NO}/pages/leveransinfo" target="_blank" rel="noopener">les mer her</a>.</p>`,
    },
    {
      kind: "info", key: "info_retur", showWhen: { field: "topic", in: ["retur"] },
      html:
        `<p>Hvis du ønsker å returnere eller klage på et produkt, bruk returskjemaet vårt. Klikk på lenken nedenfor for å komme til returskjemaet:</p>` +
        `<p><a href="${NO}/pages/returformular" target="_blank" rel="noopener">Gå til returskjemaet</a></p>`,
    },
    {
      kind: "info", key: "info_orderbekraftelse", showWhen: { field: "topic", in: ["orderbekraftelse"] },
      html: `<p>Har du dobbeltsjekket søppelposten din? Hvis ja, fortsett å fylle ut skjemaet, så hjelper vi deg!</p>`,
    },
    {
      kind: "info", key: "info_bestallning", showWhen: { field: "topic", in: ["bestallning"] },
      html:
        `<p>Har du sjekket om du fant svaret på spørsmålet ditt i <a href="${NO}/pages/vanliga-fragor" target="_blank" rel="noopener">våre ofte stilte spørsmål</a>?</p>` +
        `<p>Hvis ja, fortsett å fylle ut skjemaet, så hjelper vi deg!</p>`,
    },
    {
      kind: "info", key: "info_klarna", showWhen: { field: "topic", in: ["klarna"] },
      html:
        `<p>Når du har lagt inn en bestilling hos oss, vil kjøpet ditt være synlig for Klarna, betalingspartneren vår. Gjennom <a href="https://www.klarna.com/no/kundeservice/" target="_blank" rel="noopener">Klarnas nettside</a> eller appen deres kan du enkelt logge inn med BankID og få oversikt over alle kjøpene dine.</p>` +
        `<p>Hvis du har spesifikke spørsmål om fakturaen eller betalingen din, eller hvis du trenger en spesifikk kvittering, anbefaler vi at du <a href="https://www.klarna.com/no/kundeservice/" target="_blank" rel="noopener">kontakter Klarna direkte her</a>.</p>` +
        `<p>Hvis forfallsdatoen nærmer seg og du ikke har mottatt pakken din, kan du forlenge fakturaperioden ved å kontakte Klarna.</p>` +
        `<p>Du er selvfølgelig også velkommen til å kontakte kundeservicen vår hvis du trenger mer hjelp eller har andre spørsmål.</p>`,
    },
    {
      kind: "info", key: "info_skadad", showWhen: { field: "topic", in: ["skadad"] },
      html:
        `<p>Vi beklager at et av produktene våre har blitt skadet under frakt. For å kunne hjelpe deg så raskt og smidig som mulig, ber vi deg sende oss et bilde eller en video som tydelig viser skaden eller feilen.</p>` +
        `<p>Fyll ut skjemaet nedenfor, så kommer vi tilbake til deg så snart som mulig med en løsning!</p>`,
    },
    {
      kind: "info", key: "info_rabatt", showWhen: { field: "topic", in: ["rabatt"] },
      html:
        `<p>Har du spørsmål om en rabatt- eller kupongkode? Hver kode har unike betingelser, for eksempel gyldighetsperiode eller et eventuelt minimumsbeløp som kreves for å få rabatten.</p>` +
        `<p>Vær oppmerksom på at rabattkoder må brukes før et kjøp gjennomføres og ikke kan legges til i etterkant.</p>` +
        `<p>Lurer du fortsatt på noe? Send oss en melding nedenfor, så hjelper vi deg gjerne!</p>`,
    },
    { kind: "text", key: "first_name", label: "Fornavn", role: "first_name", required: true, showWhen: { field: "topic", in: NO_KONTAKT_AMNEN } },
    { kind: "text", key: "last_name", label: "Etternavn", role: "last_name", required: true, showWhen: { field: "topic", in: NO_KONTAKT_AMNEN } },
    { kind: "email", key: "email", label: "E-postadresse", role: "email", required: true, placeholder: "E-postadressen din", showWhen: { field: "topic", in: NO_KONTAKT_AMNEN } },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", role: "order_number", placeholder: "F.eks. 12345", showWhen: { field: "topic", in: NO_KONTAKT_AMNEN } },
    { kind: "textarea", key: "message", label: "Meldingen din", role: "message", required: true, placeholder: "Fortell oss hvordan vi kan hjelpe deg", showWhen: { field: "topic", in: NO_KONTAKT_AMNEN } },
    {
      kind: "file", key: "attachment", label: "Last opp bilde", accept: "image/*,video/*,application/pdf", maxFiles: 3,
      help: "F.eks. bildebevis på ordrebekreftelse eller skadet produkt", showWhen: { field: "topic", in: NO_KONTAKT_AMNEN },
    },
  ],
  endings: {
    success: { title: "Takk for meldingen din!", html: `<p>Vi svarer deg så snart vi kan.</p>` },
  },
} as FormConfig;

const noRetur: FormConfig = {
  // Ingen `title` - se noKontakt.
  submitLabel: "Send inn",
  ticket: { kindLabel: "Retur", priority: 1 },
  intro:
    `<p>For å være berettiget til retur må varen være i samme stand som du mottok den, brukt eller ubrukt, med etiketter og i originalemballasjen. Du trenger også kvitteringen eller kjøpsbevis.</p>` +
    `<p>Bruk returadressen som er oppgitt i returinstruksjonene. Du står for returfrakten, og returen må sendes med sporbart sendingsnummer. Varer som sendes tilbake uten at det først er bedt om retur, blir ikke akseptert. Når vi har mottatt søknaden din, går vi gjennom den og kommer tilbake til deg med vår beslutning og videre instruksjoner.</p>` +
    `<p>For fullstendig informasjon, se <a href="${NO}/pages/returpolicy" target="_blank" rel="noopener">retur- og refusjonspolicyen vår</a>.</p>`,
  fields: [
    { kind: "info", key: "info_rek", html: `<p><strong>VIKTIG:</strong> Returer må sendes som vanlig pakke, IKKE som rekommandert brev.</p>` },
    { kind: "text", key: "first_name", label: "Fornavn", role: "first_name", required: true },
    { kind: "text", key: "last_name", label: "Etternavn", role: "last_name", required: true },
    { kind: "email", key: "email", label: "E-postadresse", role: "email", required: true, placeholder: "E-postadressen du bestilte med" },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", role: "order_number", required: true, placeholder: "F.eks. 12345" },
    { kind: "date", key: "purchase_date", label: "Kjøpsdato", role: "delivery_date", required: true },
    { kind: "textarea", key: "products", label: "Hvilke(t) produkt(er) ønsker du å returnere?", required: true },
    {
      kind: "select", key: "quantity", label: "Antall produkter du vil returnere", required: true,
      options: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    },
    {
      kind: "radio", key: "condition", label: "Hvilken stand er produktet/produktene i?", required: true,
      options: [
        { value: "ubrukt", label: "Ubrukt" },
        { value: "brukt", label: "Åpnet/brukt" },
        { value: "skadet", label: "Skadet" },
      ],
    },
    {
      kind: "radio", key: "reason", label: "Hvorfor vil du returnere/klage?", role: "message", required: true,
      options: [
        { value: "trasig", label: "Produktet er ødelagt/fungerer ikke som det skal" },
        { value: "angret", label: "Jeg har angret kjøpet og vil returnere det" },
        { value: "fel_produkt", label: "Jeg fikk feil produkter i pakken" },
        { value: "avbryta", label: "Jeg vil kansellere bestillingen min" },
      ],
    },
    {
      kind: "info", key: "info_reklamation", showWhen: { field: "reason", in: ["trasig"] },
      html: `<p><strong>REKLAMASJON</strong></p><p>For at vi skal kunne hjelpe deg må du legge ved et bilde eller en video som viser skaden eller feilen.</p>`,
    },
    {
      kind: "info", key: "info_avbryta", showWhen: { field: "reason", in: ["avbryta"] },
      html:
        `<p><strong>KANSELLERE BESTILLING</strong></p>` +
        `<p>Du kan kansellere ett eller flere produkter frem til bestillingen er pakket.</p>` +
        `<p>Hvis bestillingen allerede er sendt, må du opprette en retur når du har mottatt den. Du får en bekreftelse på e-post hvis bestillingen din er kansellert.</p>` +
        `<p>Hvis du ikke får noen bekreftelse, betyr det at bestillingen allerede er pakket og klar for levering. I så fall må du vente til du får pakken og deretter opprette en vanlig retur.</p>`,
    },
    { kind: "textarea", key: "reason_details", label: "Fortell gjerne mer om årsaken" },
    {
      kind: "file", key: "attachment", label: "Last opp bilde/video", required: true, accept: "image/*,video/*,application/pdf", maxFiles: 3,
      help: "F.eks. bildebevis på ordrebekreftelse eller skadet produkt", showWhen: { field: "reason", in: ["trasig", "fel_produkt"] },
    },
    {
      kind: "checkbox", key: "confirm", required: true,
      text: "Som kunde godtar du at du står for returfrakten, og at returen sendes med et sporbart sendingsnummer.",
    },
    {
      kind: "info", key: "info_klimatsmart", showWhen: { field: "confirm", notEmpty: true },
      html:
        `<p><strong>🌱 Klimasmart løsning</strong></p>` +
        `<p>For å redusere unødvendige returer og transport, og i håp om at produktet kommer til nytte, tilbyr vi nå et alternativ der du kan beholde produktet og få tilbake 50% av prisen.</p>` +
        `<p>Slik håper vi at produktet kan være til glede og nytte for deg eller noen du kjenner, eller kanskje bli gitt bort til et godt formål. Velger du dette alternativet, skjer refusjonen innen 7 dager.</p>` +
        `<p>Vær oppmerksom på at garantien og reklamasjonsretten bortfaller hvis du velger dette alternativet.</p>`,
    },
    {
      kind: "radio", key: "solution", label: "Velg alternativ", required: true, showWhen: { field: "confirm", notEmpty: true },
      options: [
        { value: "klimatsmart", label: "Klimasmart løsning" },
        { value: "returnera_sjalv", label: "Send pakken i retur selv" },
      ],
    },
  ],
  endings: {
    success: { title: "Takk for meldingen din!", html: `<p>Vi svarer deg så snart vi kan.</p>` },
  },
} as FormConfig;

const noAngerratt: FormConfig = {
  title: "Angre kjøpet ditt",
  submitLabel: "Jeg bekrefter at jeg angrer avtalen",
  // Lagstadgad. Ingen dateGate - en angrebegäran får aldrig avvisas på tid.
  ticket: { kindLabel: "Ångerrätt", priority: 3, tags: ["anger"] },
  intro:
    `<p>Her bruker du din lovfestede angrerett og går fra kjøpsavtalen din. Du har 14 dagers angrerett fra du mottok varen, og du kan angre kjøpet allerede før varen er sendt. Det er kostnadsfritt, og du trenger ikke oppgi noen grunn.</p>` +
    `<p>Fyll ut opplysningene nedenfor, så bekrefter vi mottaket på e-post.</p>`,
  fields: [
    { kind: "text", key: "first_name", label: "Fornavn", role: "first_name", required: true },
    { kind: "text", key: "last_name", label: "Etternavn", role: "last_name", required: true },
    { kind: "email", key: "email", label: "E-postadresse", role: "email", required: true, placeholder: "E-postadressen du bestilte med" },
    { kind: "text", key: "order_number", label: "Bestillingsnummer", role: "order_number", required: true, help: "Står i ordrebekreftelsen din, f.eks. #12345" },
    { kind: "textarea", key: "message", label: "Melding", role: "message" },
    { kind: "pagebreak", key: "step2", label: "Fortsett" },
    {
      kind: "info", key: "confirm_intro",
      html:
        `<h2>Bekreft at du angrer avtalen</h2>` +
        `<p>Du er i ferd med å gå fra kjøpsavtalen din for bestilling {{order_number}}. Når du klikker nedenfor, registrerer vi at du angrer kjøpet, og vi sender en bekreftelse på mottak til {{email}}.</p>`,
    },
  ],
  endings: {
    success: {
      title: "Takk, vi har mottatt meldingen din",
      html: `<p>Meldingen om at du angrer kjøpet er registrert, og en bekreftelse er på vei til e-posten din. Du trenger ikke gjøre noe mer nå - vi kommer tilbake med neste steg.</p>`,
    },
  },
} as FormConfig;

// ---------------------------------------------------------------------------
async function main() {
  console.log(SKARPT ? "SKARP KÖRNING - skriver till databasen\n" : "TORRKÖRNING - inget skrivs. Lägg till --skarpt för att skriva.\n");

  const { data: rader, error } = await sb.from("forms").select("*");
  if (error) throw error;

  const hitta = (ws: string, slug: string, market: string) =>
    (rader ?? []).find((r) => r.workspace_id === ws && r.slug === slug && r.market === market);

  // --- laga befintliga ---
  const lagningar: [string, string, string, (c: FormConfig) => void][] = [
    [HAPPYSLEEP, "kontakt", "se", (c) => lagaHappysleepKontakt(c, "se")],
    [HAPPYSLEEP, "kontakt", "dk", (c) => lagaHappysleepKontakt(c, "dk")],
    [HAPPYSLEEP, "retur", "se", (c) => lagaHappysleepRetur(c, "se")],
    [HAPPYSLEEP, "retur", "dk", (c) => lagaHappysleepRetur(c, "dk")],
    [HAPPYSLEEP, "angerratt", "se", (c) => lagaHappysleepAngerratt(c, "se")],
    [HAPPYSLEEP, "angerratt", "dk", (c) => lagaHappysleepAngerratt(c, "dk")],
    [HYDRO13, "kontakt", "se", lagaEnvanaKontakt],
    [HYDRO13, "retur", "se", lagaEnvanaRetur],
    [HYDRO13, "garanti", "se", lagaEnvanaGaranti],
    [HYDRO13, "angerratt", "se", lagaEnvanaAngerratt],
  ];

  for (const [ws, slug, market, laga] of lagningar) {
    const rad = hitta(ws, slug, market);
    if (!rad) { console.log(`SAKNAS: ${slug}/${market}`); continue; }
    const cfg: FormConfig = JSON.parse(JSON.stringify(rad.config));
    logg.length = 0;
    laga(cfg);
    const andrat = JSON.stringify(cfg) !== JSON.stringify(rad.config);
    console.log(`${andrat ? "ÄNDRAS" : "oförändrad"}  ${rad.name}`);
    logg.forEach((l) => console.log(l));
    if (andrat && SKARPT) {
      const { error: e } = await sb.from("forms").update({ config: cfg }).eq("id", rad.id);
      if (e) throw e;
    }
  }

  // --- nya ---
  const nya: [string, string, string, string, FormConfig][] = [
    [HAPPYSLEEP, "garanti", "se", "Kollagengaranti (SwedishBalance SE)", sbGaranti],
    [HAPPYSLEEP, "kontakt", "no", "Kontakt oss (SwedishBalance NO)", noKontakt],
    [HAPPYSLEEP, "retur", "no", "Returskjema (SwedishBalance NO)", noRetur],
    [HAPPYSLEEP, "angerratt", "no", "Angrerett EU (SwedishBalance NO)", noAngerratt],
  ];

  for (const [ws, slug, market, name, config] of nya) {
    const fanns = hitta(ws, slug, market);
    console.log(`${fanns ? "UPPDATERAS" : "SKAPAS"}  ${name}  (${config.fields.length} fält)`);
    if (!SKARPT) continue;
    const { error: e } = await sb
      .from("forms")
      .upsert(
        { workspace_id: ws, slug, market, name, status: "published", config },
        { onConflict: "workspace_id,slug,market" }
      );
    if (e) throw e;
  }

  console.log(SKARPT ? "\nKlart." : "\nTorrkörning klar.");
}

main().catch((e) => { console.error(e); process.exit(1); });
