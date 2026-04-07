import { NextRequest, NextResponse } from "next/server";

/**
 * Fillout webhook → Freshdesk ticket bridge for Renew (get-renew.com).
 *
 * Replaces the previous Fillout → Zapier → Freshdesk flow.
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

function findName(questions: FilloutQuestion[]): string | null {
  for (const q of questions) {
    const name = (q.name || "").toLowerCase();
    if (
      name.includes("namn") ||
      name === "name" ||
      name.includes("first name") ||
      name.includes("förnamn") ||
      name.includes("fornamn")
    ) {
      const v = formatValue(q.value);
      if (v && v !== "(tomt svar)") return v;
    }
  }
  return null;
}

function buildDescription(
  questions: FilloutQuestion[],
  meta: { formName?: string; submissionId?: string; submissionTime?: string }
): string {
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

  for (const q of questions) {
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

function buildSubject(formName: string | undefined, customerName: string | null): string {
  const form = formName?.trim() || "formulärinlämning";
  if (customerName) return `${form} - ${customerName}`;
  return `Ny ${form}`;
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

  // Detect Fillout's "Test" button which sends a dummy payload:
  //   - empty submissionId
  //   - all question values are null/empty
  // Accept it without creating a ticket so the Test button shows success.
  const isEmptyTest =
    (!submission.submissionId || submission.submissionId === "") &&
    questions.every((q) => q.value === null || q.value === undefined || q.value === "");
  if (isEmptyTest) {
    console.log("[fillout-to-freshdesk] Detected Fillout test ping, skipping ticket creation");
    return NextResponse.json({
      ok: true,
      test: true,
      message: "Test webhook received - endpoint is reachable. No ticket created.",
    });
  }

  const email = findEmail(questions);
  if (!email) {
    console.error("[fillout-to-freshdesk] No email found in submission");
    return NextResponse.json({ error: "No email field found in submission" }, { status: 400 });
  }

  const customerName = findName(questions);
  const subject = buildSubject(body.formName, customerName);
  const description = buildDescription(questions, {
    formName: body.formName,
    submissionId: submission.submissionId,
    submissionTime: submission.submissionTime,
  });

  const ticketPayload: Record<string, unknown> = {
    email,
    subject,
    description,
    status: 2, // Open
    priority: 1, // Low
    tags: ["fillout", "website-form"],
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
