// Self-hosted support forms (replaces Fillout, phase 1: Envana).
// A form is a config-driven JSON document rendered by public/forms-embed/v1.js
// on the Shopify storefront. Submissions are persisted FIRST (form_submissions),
// then delivered to the workspace's helpdesk by src/lib/form-delivery.ts.

/** Semantic role of a field - lets the ticket builder extract email/name/order
 *  number/delivery date without keyword-sniffing labels (the old Fillout bridge
 *  had to guess from Swedish/Norwegian/Danish label variants). */
export type FormFieldRole =
  | "email"
  | "first_name"
  | "last_name"
  | "order_number"
  | "delivery_date"
  | "message";

/** Show a field only when another field's value is in the list (`in`) or has
 *  any non-empty value (`notEmpty`) - the latter powers "visa kontaktfälten
 *  först när ett ämne är valt" (Fillout-paritet). */
/** `isEmpty` behovs for "visa det har BARA om vi inte redan vet det": e-post-
 *  steget i progressbild doljs nar tokenuppslaget redan gett oss adressen. */
export type FormCondition = {
  /** Utelamnas nar `all` anvands - da bar delvillkoren varsitt falt. */
  field?: string;
  in?: string[];
  notEmpty?: boolean;
  isEmpty?: boolean;
  /** Alla delvillkor maste halla. For falt som beror pa mer an ett svar. */
  all?: FormCondition[];
};

/** Avslutningsskärmen. `variants` väljs före basen: första variant vars
 *  `showWhen` stämmer vinner, annars används `title`/`html`.
 *
 *  Finns för att ETT formulär kan bära flera tillfällen. Progressbild kör tre
 *  bilder genom samma formulär, och utan varianter fick sista bilden samma
 *  "vi hör av oss om 30 dagar" som de två första - vilket inte är sant, då är
 *  serien slut. William fångade det vid sitt första riktiga test 2026-09-15. */
export type FormEnding = {
  title: string;
  html?: string;
  variants?: { showWhen?: FormCondition; title: string; html?: string }[];
};

export interface FormFieldBase {
  key: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  role?: FormFieldRole;
  showWhen?: FormCondition;
  /** Förifyll fältet från query-strängen på sidan formuläret ligger på.
   *  `fromParam: "e"` + länk `?e=anna@exempel.se` fyller fältet åt kunden.
   *  Värdet går att ändra - det är en genväg, inte en låsning. */
  fromParam?: string;
  /** Värde när parametern saknas i länken. */
  fallback?: string;
}

export type FormField =
  // Static info banner (the blue Fillout-style info blocks)
  | ({ kind: "info"; html: string } & FormFieldBase)
  | ({ kind: "text" | "email" | "textarea" | "date" } & FormFieldBase)
  | ({ kind: "select" | "radio"; options: { value: string; label: string }[] } & FormFieldBase)
  // Checkbox with confirmation text (godkännande)
  | ({ kind: "checkbox"; text: string } & FormFieldBase)
  // `asCta` gör stegets egen CTA till den som öppnar filväljaren, i stället för
  // en separat knapp ovanför den. Skärmen "ta bilden" hade tre knappar (välj
  // bild, se exempel, fortsätt) där den sista såg avstängd ut tills bilden var
  // vald. Med asCta finns EN knapp: den heter `ctaLabel` och öppnar väljaren,
  // och när bilden är vald byter den tillbaka till stegets vanliga etikett.
  // Element med `data-chf-pick` i samma steg öppnar också väljaren.
  | ({ kind: "file"; accept?: string; maxFiles?: number; asCta?: boolean; ctaLabel?: string } & FormFieldBase)
  // Osynligt fält vars värde kommer från query-strängen på sidan formuläret
  // ligger på (?steg=2). Låter ETT formulär bära flera varianter i stället för
  // en kopia per variant. `fromParam` = parameterns namn, `fallback` = värdet
  // när parametern saknas.
  // Val som KNAPPAR, inte som en lista man far bocka i. Varje knapp satter
  // faltets varde och gar vidare direkt. Monstret ar mobilspelens
  // "Free / Double Reward": ett val mellan tva knappar dar den ena ar den
  // lockande, inte en blankett med en kryssruta i.
  //
  // Steget ritar INGEN egen CTA - knapparna ar stegets handling.
  | ({
      kind: "choice";
      options: { value: string; label: string; sub?: string; style?: "primary" | "quiet" }[];
    } & FormFieldBase)
  | ({ kind: "hidden" } & FormFieldBase)
  // Page break: splits the form into steps. `label` = the continue-button
  // text for the step BEFORE the break (e.g. "Fortsätt"). Used for the
  // EU-mandated two-step ångerrätt confirmation.
  | ({ kind: "pagebreak" } & FormFieldBase);

/** Date-window gating (retur 0-14 dagar, garanti 60-90 dagar). Evaluated
 *  server-side on the field with role "delivery_date". Out-of-window
 *  submissions are stored with gate_status + delivery_status "skipped"
 *  (the old bridge dropped them without a trace). Ångerrätt has NO gate -
 *  a statutory withdrawal must always be accepted. */
export interface FormDateGate {
  minDays?: number;
  maxDays?: number;
}

export interface FormTicketConfig {
  /** Subject prefix, e.g. "Retur", "Garanti", "Kontakt", "Ångerrätt" */
  kindLabel?: string;
  /** Freshdesk priority: 1 Low, 2 Medium, 3 High. Default 1 (ångerrätt: 3). */
  priority?: number;
  tags?: string[];
}

/** Utseendeläge. `"app"` renderar formuläret som en fullskärms onboarding i
 *  stället för ett webbformulär i en vit ruta: brandfärgad bakgrund kant till
 *  kant, rund tillbakaknapp uppe till vänster, tunn progressbar under headern
 *  och en CTA i brandfärgen. Anatomin är mätt ur quiz-runtimen
 *  (runtime/quiz-runtime/src/renderer.tsx) - samma funnel som doginwork-quizet.
 *
 *  Sätts per formulär. Kontakt och ångerrätt ska förbli formulär och lämnas
 *  utan `theme`; progressbild och samtycke är en resa och kör "app".
 *  Färgerna är valfria - utan dem används Envanas tokens som default. */
export interface FormTheme {
  mode?: "app";
  /** Primärfärg: CTA, progressbar, aktiva ramar. Envana brand/500. */
  brand?: string;
  /** Sidbakgrund kant till kant. Envana bg/base. */
  bg?: string;
  /** Kort och fält som ligger PÅ bakgrunden. */
  surface?: string;
  /** Rubriker. Envana text/heading. */
  text?: string;
  /** Brödtext och hjälptext. Envana text/muted. */
  muted?: string;
  /** Logotyp centrerad i headern, som URL. `{{hub}}` ersätts med hubbens
   *  origin. Kunden kommer via en QR-kod på ett tryckt kort och ska se vem
   *  som frågar efter hennes ansiktsbilder. */
  logo?: string;
}

/** Vart en inskickning tar vägen.
 *
 *  Utan fältet: workspacets helpdesk. Det är rätt för kontakt, ångerrätt och
 *  garanti - ärenden en människa ska svara på.
 *
 *  `"none"`: inskickningen sparas och syns i /forms, men skapar inget ärende.
 *  En progressbild är ingen supportfråga. Med helpdesk-leverans får kunden ett
 *  "vi återkommer inom 24 timmar" som ingen tänker svara på, och kundservice
 *  får tre ärenden per deltagare. William fick exakt det mailet vid sitt första
 *  riktiga test 2026-09-15.
 *
 *  `{ type: "klaviyo" }`: inskickningen postas som ett event till Klaviyo, som
 *  äger mailen. `brand` väljer konto (Envana och SwedishBalance har var sitt),
 *  `metric` är metricens namn i Klaviyo och blir flödets trigger.
 *  `seriesField` pekar ut fältet som säger vilket tillfälle i en serie det är
 *  (progressbild: "steg"); finns det med skickar adaptern även kundens
 *  tidigare bilder, så mailet kan visa serien och de tomma rutorna. */
export type FormDelivery =
  | "helpdesk"
  | "none"
  | {
      type: "klaviyo";
      brand: "envana" | "swedishbalance";
      metric: string;
      seriesField?: string;
    };

export interface FormConfig {
  title?: string;
  /** HTML intro shown above the fields */
  intro?: string;
  submitLabel?: string;
  theme?: FormTheme;
  delivery?: FormDelivery;
  fields: FormField[];
  endings: {
    success: FormEnding;
    too_early?: FormEnding;
    too_late?: FormEnding;
  };
  dateGate?: FormDateGate;
  ticket?: FormTicketConfig;
}

export interface FormRow {
  id: string;
  workspace_id: string;
  slug: string;
  market: string;
  name: string;
  status: string;
  config: FormConfig;
  created_at: string;
  updated_at: string;
}

/** One answer as submitted by the embed runtime. Order is preserved and used
 *  verbatim in the ticket description. For select/radio, `value` is the
 *  option VALUE (used by showWhen/gates) and `display` the human-readable
 *  option label (used in ticket descriptions - kunden ska inte se "pren_hantera"). */
export interface SubmissionAnswer {
  key: string;
  label: string;
  value: unknown;
  display?: string;
}

export interface SubmissionFile {
  url: string;
  filename?: string;
  fieldKey?: string;
}

export type DeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

export interface FormSubmissionRow {
  id: string;
  form_id: string;
  workspace_id: string;
  market: string | null;
  client_submission_id: string;
  payload: SubmissionAnswer[];
  email: string | null;
  name: string | null;
  order_number: string | null;
  files: SubmissionFile[];
  meta: Record<string, unknown>;
  is_test: boolean;
  gate_status: "too_early" | "too_late" | null;
  delivery_status: DeliveryStatus;
  delivery_attempts: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  ticket_id: string | null;
  last_error: string | null;
  created_at: string;
}

/** Per-workspace helpdesk routing, stored in workspaces.settings.forms_helpdesk.
 *  Swapping helpdesk provider = new adapter in form-delivery.ts + point this
 *  config at it.
 *
 *  Freshdesk resolution: inline `domain` + `apiKey` (stored in settings, same
 *  pattern as workspaces.meta_config) wins; otherwise `account` maps to the
 *  legacy FRESHDESK_RENEW_* / FRESHDESK_SB_* env vars. */
export type HelpdeskConfig =
  | { type: "freshdesk"; account?: "renew" | "sb"; domain?: string; apiKey?: string }
  | { type: "email"; to: string };
