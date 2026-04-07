import { NextRequest, NextResponse } from "next/server";

/**
 * Fillout webhook -> Freshdesk ticket bridge for Renew (get-renew.com).
 *
 * Replaces the previous Fillout -> Zapier -> Freshdesk flow.
 *
 * How tickets are created:
 *   Uses Freshdesk's `POST /tickets/outbound_email` endpoint (source: 10) so the
 *   ticket DESCRIPTION is sent to the customer as the agent's first email. This
 *   skips Freshdesk's default "new ticket" auto-acknowledge entirely - the customer
 *   gets exactly one Renew-branded email and the agent sees the ticket in Freshdesk
 *   with the original form data attached as a private note.
 *
 * Setup in Fillout:
 *   Form > Integrations > Webhook > POST to:
 *     https://content-hub-nine-theta.vercel.app/api/fillout-to-freshdesk
 *   Optionally add a shared secret header:
 *     Authorization: Bearer <FILLOUT_WEBHOOK_SECRET>
 *
 * Env vars (Vercel):
 *   FRESHDESK_RENEW_DOMAIN     e.g. "getrenew" (without .freshdesk.com)
 *   FRESHDESK_RENEW_API_KEY    Freshdesk API key
 *   FILLOUT_WEBHOOK_SECRET     Optional shared secret to reject spoofed calls
 */

export const maxDuration = 30;

// Freshdesk mailbox to send the outbound acknowledgement from. This is the
// "kundservice@get-renew.com" mailbox in the Renew Freshdesk account. If this
// ID ever changes, update it here. (Looked up via GET /api/v2/email_configs.)
const RENEW_EMAIL_CONFIG_ID = 10000008354;

interface FilloutQuestion {
  id: string;
  name: string;
  type: string;
  value: unknown;
}

interface FilloutSubmission {
  submissionId?: string;
  submissionTime?: string;
  lastUpdatedAt?: string;
  questions?: FilloutQuestion[];
  urlParameters?: Array<{ id?: string; name?: string; value?: unknown }>;
  calculations?: Array<{ id?: string; name?: string; value?: unknown }>;
}

interface FilloutWebhookBody {
  formId?: string;
  formName?: string;
  submission?: FilloutSubmission;
  // Some Fillout setups send the submission fields at the root, so accept both shapes.
  submissionId?: string;
  questions?: FilloutQuestion[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(tomt svar)";
  if (typeof value === "string") return value.trim() || "(tomt svar)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "(tomt svar)";
    return value
      .map((v) => {
        if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value);
        if (v && typeof v === "object" && "label" in v) return String((v as { label: unknown }).label);
        return typeof v === "string" ? v : JSON.stringify(v);
      })
      .join(", ");
  }
  if (typeof value === "object") {
    // Common Fillout shapes: { value: "..." }, { label: "..." }, { url: "...", filename: "..." }
    const obj = value as Record<string, unknown>;
    if ("filename" in obj && "url" in obj) return `${String(obj.filename)} (${String(obj.url)})`;
    if ("url" in obj) return String(obj.url);
    if ("label" in obj) return String(obj.label);
    if ("value" in obj) return formatValue(obj.value);
    return JSON.stringify(value);
  }
  return String(value);
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function findEmail(questions: FilloutQuestion[]): string | null {
  // 1. Look for explicit email type
  for (const q of questions) {
    if (q.type && q.type.toLowerCase().includes("email")) {
      const v = formatValue(q.value);
      if (looksLikeEmail(v)) return v;
    }
  }
  // 2. Look for question name containing "email" / "e-post" / "epost" / "mail"
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (name.includes("email") || name.includes("e-post") || name.includes("epost") || name.includes("mail")) {
      const v = formatValue(q.value);
      if (looksLikeEmail(v)) return v;
    }
  }
  // 3. Last resort: any value that looks like an email
  for (const q of questions) {
    const v = formatValue(q.value);
    if (looksLikeEmail(v)) return v;
  }
  return null;
}

function findFirstName(questions: FilloutQuestion[]): string | null {
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (name.includes("förnamn") || name.includes("fornamn") || name.includes("first name")) {
      const v = formatValue(q.value);
      if (v && v !== "(tomt svar)") return v;
    }
  }
  return null;
}

function findLastName(questions: FilloutQuestion[]): string | null {
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (name.includes("efternamn") || name.includes("last name") || name.includes("surname")) {
      const v = formatValue(q.value);
      if (v && v !== "(tomt svar)") return v;
    }
  }
  return null;
}

function buildFullName(questions: FilloutQuestion[]): string | null {
  const first = findFirstName(questions);
  const last = findLastName(questions);
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  // Fallback: any field literally called "namn" / "name"
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (name === "namn" || name === "name" || name === "fullständigt namn") {
      const v = formatValue(q.value);
      if (v && v !== "(tomt svar)") return v;
    }
  }
  return null;
}

function findOrderNumber(questions: FilloutQuestion[]): string | null {
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (
      name.includes("ordernummer") ||
      name.includes("order number") ||
      name === "order" ||
      name === "ordernr" ||
      name === "order nr"
    ) {
      const v = formatValue(q.value);
      if (v && v !== "(tomt svar)") {
        // Strip a leading # so we can re-add it consistently
        return v.replace(/^#+/, "").trim();
      }
    }
  }
  return null;
}

// Time windows for date-gated forms. Submissions outside these windows are silently
// dropped (no Freshdesk ticket created) since Fillout shows the customer a "för tidigt"
// or "för sent" ending page but still fires the webhook.
//
//   - Retur:    must request within 14 days of delivery (max only)
//   - Garanti:  must wait at least 60 days (min daily usage required for the result
//               guarantee), and at most 90 days (application window)
const RETURN_MAX_DAYS = 14;
const GUARANTEE_MIN_DAYS = 60;
const GUARANTEE_MAX_DAYS = 90;

const FORM_TIME_WINDOWS: Record<"retur" | "garanti", { minDays?: number; maxDays: number }> = {
  retur: { maxDays: RETURN_MAX_DAYS },
  garanti: { minDays: GUARANTEE_MIN_DAYS, maxDays: GUARANTEE_MAX_DAYS },
};

function findDeliveryDate(questions: FilloutQuestion[]): Date | null {
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    const type = (q.type || "").toLowerCase();
    const isDateField = type.includes("date");
    const isDelivery =
      name.includes("mottog") ||
      name.includes("leverans") ||
      name.includes("received") ||
      name.includes("delivery");
    if (!isDateField || !isDelivery || !q.value) continue;
    const raw = typeof q.value === "string" ? q.value : String(q.value);
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function daysSince(date: Date): number {
  const diffMs = Date.now() - date.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function reorderNameFields(questions: FilloutQuestion[]): FilloutQuestion[] {
  // Make sure Förnamn (first name) appears before Efternamn (last name) regardless of form order.
  const firstNameIdx = questions.findIndex((q) => {
    const n = (q.name || "").toLowerCase();
    return n.includes("förnamn") || n.includes("fornamn") || n.includes("first name");
  });
  const lastNameIdx = questions.findIndex((q) => {
    const n = (q.name || "").toLowerCase();
    return n.includes("efternamn") || n.includes("last name") || n.includes("surname");
  });
  if (firstNameIdx === -1 || lastNameIdx === -1 || firstNameIdx < lastNameIdx) {
    return questions;
  }
  const reordered = [...questions];
  const [firstName] = reordered.splice(firstNameIdx, 1);
  reordered.splice(lastNameIdx, 0, firstName);
  return reordered;
}

// Builds the HTML body of the private agent-only note that holds the original
// form submission. This is what the agent sees when they open the ticket - it
// preserves all the answers exactly as the customer submitted them.
function buildFormDataNote(
  questions: FilloutQuestion[],
  meta: { formName?: string; submissionId?: string; submissionTime?: string }
): string {
  const ordered = reorderNameFields(questions);
  const lines: string[] = [];
  lines.push(`<h2>Formulärdata</h2>`);
  if (meta.formName) lines.push(`<p><strong>Formulär:</strong> ${escapeHtml(meta.formName)}</p>`);
  if (meta.submissionTime) {
    const t = new Date(meta.submissionTime);
    if (!isNaN(t.getTime())) {
      lines.push(`<p><strong>Skickat:</strong> ${escapeHtml(t.toLocaleString("sv-SE"))}</p>`);
    }
  }
  if (meta.submissionId) lines.push(`<p><strong>Submission ID:</strong> ${escapeHtml(meta.submissionId)}</p>`);
  lines.push(`<hr>`);

  for (const q of ordered) {
    const question = (q.name || "Fråga").trim();
    const answer = formatValue(q.value);
    lines.push(`<p><strong>${escapeHtml(question)}</strong><br>${escapeHtml(answer).replace(/\n/g, "<br>")}</p>`);
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanFormName(formName: string | undefined): string {
  // Strip leading symbols/whitespace like "®" that Fillout often prefixes form names with
  return (formName || "").replace(/^[\s®©™\u00A9\u00AE\u2122]+/, "").trim();
}

type FormKind = "retur" | "garanti" | "kontakt" | "other";

function detectFormKind(formName: string | undefined): FormKind {
  const lower = cleanFormName(formName).toLowerCase();
  if (lower.includes("retur")) return "retur";
  if (lower.includes("garanti")) return "garanti";
  if (lower.includes("kontakt") || lower.includes("contact")) return "kontakt";
  return "other";
}

// Friendly customer-facing email body sent as the outbound acknowledgement.
// Mirrors the SwedishBalance Fillout template the user shared but with Renew
// branding and no link back to the ticket.
function buildAcknowledgementHtml(formKind: FormKind, firstName: string | null): string {
  const greeting = firstName
    ? `Hej ${escapeHtml(firstName)} <span style="font-size: 18px;">&#128075;</span>`
    : `Hej <span style="font-size: 18px;">&#128075;</span>`;

  let confirmation: string;
  switch (formKind) {
    case "retur":
      confirmation = "Vi vill bekr&auml;fta att vi har mottagit din returanm&auml;lan och att ett &auml;rende har skapats.";
      break;
    case "garanti":
      confirmation =
        "Vi vill bekr&auml;fta att vi har mottagit din ans&ouml;kan om kollagen-garantin och att ett &auml;rende har skapats.";
      break;
    case "kontakt":
      confirmation =
        "Vi vill bekr&auml;fta att vi har mottagit ditt meddelande och att ett &auml;rende har skapats.";
      break;
    default:
      confirmation =
        "Vi vill bekr&auml;fta att vi har mottagit din formul&auml;rinl&auml;mning och att ett &auml;rende har skapats.";
  }

  // Inline styles only - many email clients (Gmail, Outlook) strip <style> tags.
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; color: #1a1a1a; line-height: 1.6; font-size: 15px;">
  <div style="text-align: center; margin: 24px 0 32px 0;">
    <span style="display: inline-block; background: #2d8b6e; color: #ffffff; padding: 14px 36px; border-radius: 8px; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">renew</span>
  </div>
  <p style="margin: 0 0 16px 0; font-size: 16px;">${greeting}</p>
  <p style="margin: 0 0 16px 0;">${confirmation}</p>
  <p style="margin: 0 0 16px 0;">En supportrepresentant kommer att granska ditt &auml;rende och skicka ett svar till dig (vanligtvis inom 48 timmar).</p>
  <p style="margin: 0 0 24px 0;">Tack f&ouml;r ditt t&aring;lamod! <span style="color: #e25555;">&#10084;&#65039;</span></p>
  <p style="margin: 32px 0 0 0;">Med v&auml;nliga h&auml;lsningar,<br>Renew kundservice</p>
</div>`;
}

function buildSubject(formName: string | undefined, questions: FilloutQuestion[]): string {
  const cleaned = cleanFormName(formName);
  const fullName = buildFullName(questions);
  const orderNumber = findOrderNumber(questions);
  const kind = detectFormKind(formName);

  // Form-specific subject prefixes: "Retur #1234 - William Hedin", "Garanti #1234 - ...", "Kontakt #1234 - ..."
  const PREFIXES: Record<Exclude<FormKind, "other">, string> = {
    retur: "Retur",
    garanti: "Garanti",
    kontakt: "Kontakt",
  };
  if (kind !== "other") {
    const parts: string[] = [PREFIXES[kind]];
    if (orderNumber) parts.push(`#${orderNumber}`);
    if (fullName) parts.push(`- ${fullName}`);
    return parts.join(" ");
  }

  // Generic fallback: "Kontaktformulär - William Hedin" or "Ny formulärinlämning"
  const formLabel = cleaned || "formulärinlämning";
  if (fullName) return `${formLabel} - ${fullName}`;
  return `Ny ${formLabel.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  // Optional: verify shared secret to reject spoofed calls
  const expectedSecret = process.env.FILLOUT_WEBHOOK_SECRET?.trim();
  if (expectedSecret) {
    const auth = req.headers.get("authorization") || "";
    const provided = auth.replace(/^Bearer\s+/i, "").trim();
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const domain = process.env.FRESHDESK_RENEW_DOMAIN?.trim();
  const apiKey = process.env.FRESHDESK_RENEW_API_KEY?.trim();
  if (!domain || !apiKey) {
    console.error("[fillout-to-freshdesk] Missing FRESHDESK_RENEW_DOMAIN or FRESHDESK_RENEW_API_KEY");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: FilloutWebhookBody;
  try {
    body = (await req.json()) as FilloutWebhookBody;
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Always log the full payload so we can inspect Fillout's webhook structure in Vercel logs
  console.log("[fillout-to-freshdesk] Received payload:", JSON.stringify(body));

  // Accept both shapes: { submission: { questions: [...] } } and { questions: [...] } at root
  const submission: FilloutSubmission = body.submission ?? {
    submissionId: body.submissionId,
    questions: body.questions,
  };
  const questions: FilloutQuestion[] = submission.questions ?? [];

  if (questions.length === 0) {
    console.warn("[fillout-to-freshdesk] No questions in payload");
    return NextResponse.json({ error: "No questions found in payload" }, { status: 400 });
  }

  // Detect Fillout's "Test" button which sends a dummy payload with an empty submissionId.
  // Real submissions always get a submissionId, so this is the most reliable indicator.
  // (Can't rely on "all values null" because Fillout fills dropdowns with default values like "1".)
  // Accept it without creating a ticket so the Test button shows success.
  const isEmptyTest = !submission.submissionId || submission.submissionId === "";
  if (isEmptyTest) {
    console.log("[fillout-to-freshdesk] Detected Fillout test ping, skipping ticket creation");
    return NextResponse.json({
      ok: true,
      test: true,
      message: "Test webhook received - endpoint is reachable. No ticket created.",
    });
  }

  // Drop out-of-window submissions. Each form has its own time window:
  //   - Return forms ("retur"):     0-14 days after delivery date
  //   - Guarantee forms ("garanti"): 60-90 days after first delivery date
  // Fillout shows the customer a "för tidigt"/"för sent" ending page but still fires
  // the webhook, so we silently drop these without creating a Freshdesk ticket.
  const formKind = detectFormKind(body.formName);
  if (formKind === "retur" || formKind === "garanti") {
    const deliveryDate = findDeliveryDate(questions);
    if (deliveryDate) {
      const days = daysSince(deliveryDate);
      const window = FORM_TIME_WINDOWS[formKind];
      const dateStr = deliveryDate.toISOString().slice(0, 10);

      if (days > window.maxDays) {
        console.log(
          `[fillout-to-freshdesk] Skipping ${formKind} ticket (too late) - delivery date ${dateStr} is ${Math.floor(days)} days ago (max: ${window.maxDays}d)`
        );
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "too_late",
          message: `Submission is more than ${window.maxDays} days old - no ticket created.`,
        });
      }

      if (window.minDays !== undefined && days < window.minDays) {
        console.log(
          `[fillout-to-freshdesk] Skipping ${formKind} ticket (too early) - delivery date ${dateStr} is only ${Math.floor(days)} days ago (min: ${window.minDays}d)`
        );
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "too_early",
          message: `Submission is less than ${window.minDays} days old - no ticket created.`,
        });
      }
    }
  }

  const email = findEmail(questions);
  if (!email) {
    console.error("[fillout-to-freshdesk] No email found in submission");
    return NextResponse.json({ error: "No email field found in submission" }, { status: 400 });
  }

  const customerName = buildFullName(questions);
  const firstName = findFirstName(questions);
  const subject = buildSubject(body.formName, questions);

  // The acknowledgement HTML is sent to the customer as the email body via Freshdesk's
  // outbound_email endpoint. The agent sees this same HTML as the ticket description.
  const acknowledgementHtml = buildAcknowledgementHtml(formKind, firstName);

  // The original form data is attached as a private note (agent-only) so all answers
  // are preserved without being emailed to the customer.
  const formDataNote = buildFormDataNote(questions, {
    formName: body.formName,
    submissionId: submission.submissionId,
    submissionTime: submission.submissionTime,
  });

  // Add form-type tag so support staff can filter (retur / garanti / kontakt)
  const tags = ["fillout", "website-form"];
  if (formKind !== "other") tags.push(formKind);

  // Use outbound_email (source: 10) so Freshdesk sends the description as the agent's
  // first email to the customer and skips the default new-ticket auto-acknowledge.
  const ticketPayload: Record<string, unknown> = {
    email,
    subject,
    description: acknowledgementHtml,
    status: 2, // Open
    priority: 1, // Low
    tags,
    email_config_id: RENEW_EMAIL_CONFIG_ID,
  };
  if (customerName) ticketPayload.name = customerName;

  // Basic auth: API key as username, "X" as password
  const authHeader = "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");
  const baseUrl = `https://${domain}.freshdesk.com/api/v2`;

  const res = await fetch(`${baseUrl}/tickets/outbound_email`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ticketPayload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[fillout-to-freshdesk] Freshdesk outbound_email error ${res.status}:`, text.slice(0, 500));
    return NextResponse.json(
      { error: `Freshdesk API error (${res.status})`, details: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const ticket = (await res.json()) as { id: number };
  console.log(`[fillout-to-freshdesk] Created ticket #${ticket.id} for ${email} (outbound_email)`);

  // Attach the original form data as a private note. We don't want a single note failure
  // to fail the whole webhook (the customer email already went out), so we log + swallow.
  try {
    const noteRes = await fetch(`${baseUrl}/tickets/${ticket.id}/notes`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: formDataNote, private: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!noteRes.ok) {
      const text = await noteRes.text();
      console.error(
        `[fillout-to-freshdesk] Failed to attach form data note to ticket #${ticket.id} (${noteRes.status}):`,
        text.slice(0, 300)
      );
    }
  } catch (e) {
    console.error(`[fillout-to-freshdesk] Exception attaching form data note to ticket #${ticket.id}:`, e);
  }

  return NextResponse.json({ ok: true, ticketId: ticket.id });
}

// Allow GET for quick health check
export async function GET() {
  const configured = !!(process.env.FRESHDESK_RENEW_DOMAIN && process.env.FRESHDESK_RENEW_API_KEY);
  return NextResponse.json({
    ok: true,
    configured,
    domain: process.env.FRESHDESK_RENEW_DOMAIN ?? null,
  });
}
