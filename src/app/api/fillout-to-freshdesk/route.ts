import { NextRequest, NextResponse } from "next/server";

/**
 * Fillout webhook -> Freshdesk ticket bridge for Renew (get-renew.com).
 *
 * Replaces the previous Fillout -> Zapier -> Freshdesk flow.
 *
 * Creates a regular Freshdesk ticket with the form data as the description.
 * Freshdesk's default new-ticket auto-acknowledge is left enabled - the email
 * template is customised in Freshdesk Admin -> Workflows -> Email Notifications.
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

// Builds the HTML description of the Freshdesk ticket from the form submission.
// This is what the agent sees when they open the ticket - it preserves all the
// answers exactly as the customer submitted them.
function buildDescription(
  questions: FilloutQuestion[],
  meta: { formName?: string; submissionId?: string; submissionTime?: string }
): string {
  const ordered = reorderNameFields(questions);
  const lines: string[] = [];
  lines.push(`<h2>Ny formulärinlämning</h2>`);
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
    const answerHtml = renderAnswerHtml(q.value);
    lines.push(`<p><strong>${escapeHtml(question)}</strong><br>${answerHtml}</p>`);
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

// Fillout file upload fields arrive as [{url, filename}] (array of objects).
// Older setups may send a single object or a stringified JSON blob - handle all three.
function extractFiles(value: unknown): Array<{ url: string; filename?: string }> {
  const items = Array.isArray(value) ? value : [value];
  const files: Array<{ url: string; filename?: string }> = [];
  for (const item of items) {
    let obj: Record<string, unknown> | null = null;
    if (item && typeof item === "object") {
      obj = item as Record<string, unknown>;
    } else if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            files.push(...extractFiles(parsed));
            continue;
          }
          if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
        } catch {
          // Not JSON - ignore, treat as regular text elsewhere
        }
      }
    }
    if (obj && typeof obj.url === "string" && obj.url) {
      const filename = typeof obj.filename === "string" ? obj.filename : undefined;
      files.push({ url: obj.url, filename });
    }
  }
  return files;
}

// Returns HTML for a single form answer. File uploads become clickable <a> links
// so Freshdesk doesn't mangle the URL by trying to auto-linkify raw JSON.
function renderAnswerHtml(value: unknown): string {
  const files = extractFiles(value);
  if (files.length > 0) {
    return files
      .map((f) => {
        const label = escapeHtml(f.filename || "Bifogad fil");
        const href = escapeHtml(f.url);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      })
      .join("<br>");
  }
  const text = formatValue(value);
  return escapeHtml(text).replace(/\n/g, "<br>");
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
  const subject = buildSubject(body.formName, questions);
  const description = buildDescription(questions, {
    formName: body.formName,
    submissionId: submission.submissionId,
    submissionTime: submission.submissionTime,
  });

  // Add form-type tag so support staff can filter (retur / garanti / kontakt)
  const tags = ["fillout", "website-form"];
  if (formKind !== "other") tags.push(formKind);

  // Note on first_name / last_name in placeholders: Freshdesk auto-splits the
  // `name` field we send here at the LAST whitespace, so "William Hedin" becomes
  // first_name="William", last_name="Hedin" on the contact record. This makes
  // {{ticket.requester.first_name}} work in email notification templates without
  // any extra API calls.
  const ticketPayload: Record<string, unknown> = {
    email,
    subject,
    description,
    status: 2, // Open
    priority: 1, // Low
    tags,
  };
  if (customerName) ticketPayload.name = customerName;

  // Basic auth: API key as username, "X" as password
  const authHeader = "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");

  const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets`, {
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
    console.error(`[fillout-to-freshdesk] Freshdesk API error ${res.status}:`, text.slice(0, 500));
    return NextResponse.json(
      { error: `Freshdesk API error (${res.status})`, details: text.slice(0, 500) },
      { status: 502 }
    );
  }

  const ticket = (await res.json()) as { id: number };
  console.log(`[fillout-to-freshdesk] Created ticket #${ticket.id} for ${email}`);

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
