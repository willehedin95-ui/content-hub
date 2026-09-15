// Delivery layer for the self-hosted form system.
//
// Submissions are persisted first (form_submissions) and delivered to the
// workspace's helpdesk here - synchronously right after submit (via after())
// and by the retry sweep in the reconcile-stuck-jobs cron. A submission is
// never lost: failed deliveries stay visible in /forms with the error, and
// exhausting all retries fires a critical Telegram alert (Resend fallback).
//
// Helpdesk routing lives in workspaces.settings.forms_helpdesk (HelpdeskConfig).
// Swapping helpdesk = write a new adapter below + repoint the setting.

import { createServerSupabase } from "@/lib/supabase-admin";
import { trackKlaviyoEvent, type KlaviyoBrand } from "@/lib/klaviyo-events";
import { tokenForEmail } from "@/lib/forms-token";
import { sendTelegramNotification, escapeHtml as tgEscape } from "@/lib/telegram";
import {
  buildTicketSubject,
  buildTicketDescription,
  buildInternalNote,
  extractEmail,
} from "@/lib/form-utils";
import type {
  FormConfig,
  FormRow,
  FormSubmissionRow,
  HelpdeskConfig,
} from "@/types/forms";

const MAX_ATTEMPTS = 8;
/** How long one delivery attempt may hold a row before the sweep may retry it.
 *  Comfortably longer than a helpdesk API call, short enough that a crashed
 *  attempt self-heals within one cron pass. */
const DELIVERY_LEASE_MINUTES = 5;

/** Exponential backoff: 15m, 30m, 1h, 2h, 4h, 6h (capped). */
function nextRetryDelayMinutes(attempts: number): number {
  return Math.min(15 * Math.pow(2, Math.max(0, attempts - 1)), 360);
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

interface DeliveryInput {
  submission: FormSubmissionRow;
  form: FormRow;
  subject: string;
  description: string;
  internalNote: string;
  email: string;
  customerName: string | null;
}

interface DeliveryResult {
  ticketId: string | null;
}

/** Resolve Freshdesk credentials from a helpdesk config: inline domain/apiKey
 *  (workspace settings) wins over the legacy account -> env var mapping. */
export function resolveFreshdeskCreds(helpdesk: {
  account?: "renew" | "sb";
  domain?: string;
  apiKey?: string;
}): { domain: string; apiKey: string } | null {
  if (helpdesk.domain && helpdesk.apiKey) {
    return { domain: helpdesk.domain.trim(), apiKey: helpdesk.apiKey.trim() };
  }
  const account = helpdesk.account ?? "renew";
  const domain = (account === "sb" ? process.env.FRESHDESK_SB_DOMAIN : process.env.FRESHDESK_RENEW_DOMAIN)?.trim();
  const apiKey = (account === "sb" ? process.env.FRESHDESK_SB_API_KEY : process.env.FRESHDESK_RENEW_API_KEY)?.trim();
  if (!domain || !apiKey) return null;
  return { domain, apiKey };
}

async function deliverViaFreshdesk(
  input: DeliveryInput,
  helpdesk: { account?: "renew" | "sb"; domain?: string; apiKey?: string }
): Promise<DeliveryResult> {
  const creds = resolveFreshdeskCreds(helpdesk);
  if (!creds) {
    throw new Error(`Freshdesk not configured (no inline creds and missing env vars)`);
  }
  const { domain, apiKey } = creds;

  const config = input.form.config;
  const tags = ["hub-form", input.form.slug, ...(config.ticket?.tags ?? [])];
  const priority = config.ticket?.priority ?? 1;

  const ticketPayload: Record<string, unknown> = {
    email: input.email,
    subject: input.subject,
    description: input.description,
    status: 2, // Open
    priority,
    tags,
  };
  // Freshdesk auto-splits `name` at the last whitespace into first/last name
  // on the contact record, which makes {{ticket.requester.first_name}} work
  // in their email templates.
  if (input.customerName) ticketPayload.name = input.customerName;

  const authHeader = "Basic " + Buffer.from(`${apiKey}:X`).toString("base64");
  const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(ticketPayload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Freshdesk API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const ticket = (await res.json()) as { id: number; requester_id?: number };

  // Efterarbete som inte får fälla leveransen (ticketen finns redan):
  // 1. Intern meta som PRIVAT note - syns aldrig för kund, citeras inte i svar
  try {
    await fetch(`https://${domain}.freshdesk.com/api/v2/tickets/${ticket.id}/notes`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ body: input.internalNote, private: true }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.warn(`[form-delivery] Kunde inte lägga intern note på ticket ${ticket.id}:`, e);
  }
  // 2. Synka kontaktnamnet till senast inskickade - Freshdesk återanvänder
  //    kontakter per e-post och behåller annars ett gammalt namn i mallarna
  //    ("Hej {{first_name}}" hälsade fel efter namnbyte på samma adress)
  if (ticket.requester_id && input.customerName) {
    try {
      await fetch(`https://${domain}.freshdesk.com/api/v2/contacts/${ticket.requester_id}`, {
        method: "PUT",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.customerName }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      console.warn(`[form-delivery] Kunde inte synka kontaktnamn för ticket ${ticket.id}:`, e);
    }
  }

  return { ticketId: String(ticket.id) };
}

/** Email fallback adapter - works with ANY helpdesk (they all ingest email).
 *  Useful as a bridge while switching helpdesk providers. */
async function deliverViaEmail(input: DeliveryInput, to: string): Promise<DeliveryResult> {
  const { Resend } = await import("resend");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set (email helpdesk adapter)");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Formulär <noreply@updates.contenttools.app>",
    to,
    replyTo: input.email,
    subject: input.subject,
    html: input.description,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return { ticketId: null };
}

// ---------------------------------------------------------------------------
// Core delivery
// ---------------------------------------------------------------------------

async function alertDeliveryFailure(submission: FormSubmissionRow, formName: string, error: string): Promise<void> {
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!chatId) return;
  const msg = [
    `<b>🚨 Formulärleverans FAILED</b>`,
    `Formulär: ${tgEscape(formName)}`,
    `Från: ${tgEscape(submission.email ?? "okänd")} ${tgEscape(submission.name ?? "")}`,
    `Försök: ${submission.delivery_attempts + 1}/${MAX_ATTEMPTS}`,
    `Fel: <code>${tgEscape(error.slice(0, 200))}</code>`,
    `Submissionen ligger kvar i hubben under /forms - inget är tappat.`,
  ].join("\n");
  await sendTelegramNotification(chatId, msg, { critical: true });
}

/**
 * Attempt delivery of one submission. Loads fresh state, skips if already
 * delivered/skipped, updates delivery bookkeeping on success/failure.
 */
/** Kundens hela bildserie i ETT formulär, äldst först.
 *
 *  Zookis starkaste grepp är att mailet visar hennes egen tidigare bild plus
 *  tomma rutor för de som fattas - en påbörjad serie med hål i vill man fylla.
 *  Det kräver att eventet bär URL:erna, för Klaviyo kan inte slå upp dem.
 *
 *  Nyckeln är e-post, vilket är kedjans svagaste punkt: skriver hon fel adress
 *  vid bild två börjar en ny serie utan att någon märker det. Tills länkarna
 *  bär en signerad token är det här så bra det blir, och det är samma
 *  begränsning Zooki har.
 *
 *  Testinskickningar utesluts - annars hamnar våra egna testbilder i en riktig
 *  kunds serie om adresserna råkar vara samma. */
async function fetchImageSeries(
  formId: string,
  email: string,
  seriesField: string
): Promise<{ step: string | null; url: string; at: string }[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("form_submissions")
    .select("payload, files, created_at")
    .eq("form_id", formId)
    .eq("email", email.toLowerCase())
    .eq("is_test", false)
    .order("created_at", { ascending: true })
    .limit(20);

  // EN bild per milstolpe, senaste vinner, sorterad pa STEG och inte pa tid.
  //
  // Bada delarna ar uppmatta felfall, inte teori:
  //  - Laddar hon om sidan och skickar in igen far samma steg tva rader. Utan
  //    hopslagning blev antal_bilder 3 efter TVA milstolpar, och mailet sa
  //    "3 av 3, din resa ar klar" fast bild tre aldrig tagits.
  //  - Laddar hon upp bild 2 fore bild 1 (t.ex. efter en paminnelse hon
  //    oppnade i fel ordning) sorterade tidsordningen serien baklanges.
  const perStep = new Map<string, { step: string | null; url: string; at: string }>();
  let utanSteg = 0;
  for (const row of (data ?? []) as Pick<FormSubmissionRow, "payload" | "files" | "created_at">[]) {
    const file = (row.files ?? [])[0];
    if (!file?.url) continue;
    const stepAnswer = (row.payload ?? []).find((a) => a.key === seriesField);
    const step = stepAnswer ? String(stepAnswer.value ?? "") : null;
    // Rader utan steg kan inte slas ihop pa nyckel - de far egna platser.
    const key = step || `utan-steg-${utanSteg++}`;
    perStep.set(key, { step, url: file.url, at: row.created_at });
  }
  return [...perStep.values()].sort((a, b) => {
    const as = Number(a.step), bs = Number(b.step);
    if (Number.isFinite(as) && Number.isFinite(bs)) return as - bs;
    return a.at.localeCompare(b.at);
  });
}

/** Postar inskickningen som ett event till Klaviyo, som äger mailen.
 *
 *  Ingen ticket skapas och inget svar väntas - det här är ingen supportfråga.
 *  `unique_id` sätts till submissionens client_submission_id, så en retry
 *  efter en timeout aldrig kan skicka mailet två gånger (Klaviyo svarar 409 på
 *  ett redan mottaget id och trackKlaviyoEvent behandlar det som lyckat). */
async function deliverViaKlaviyo(
  input: DeliveryInput,
  cfg: { brand: KlaviyoBrand; metric: string; seriesField?: string }
): Promise<DeliveryResult> {
  const { submission, form, email } = input;

  const properties: Record<string, unknown> = {
    formular: form.slug,
    marknad: submission.market,
    submission_id: submission.client_submission_id,
  };
  // Svaren platt, så Klaviyo kan villkora flödet på dem (samtycke, förnamn).
  for (const answer of submission.payload ?? []) {
    properties[answer.key] = answer.display ?? answer.value;
  }
  const own = (submission.files ?? [])[0];
  if (own?.url) properties.bild_url = own.url;

  // Kundens signerade token foljer med varje event. Klaviyo kan inte rakna
  // HMAC sjalvt, sa den maste komma harifran; darefter sparas den pa profilen
  // och kan anvandas i lankarna i ALLA mail. Det ar den som later formularet
  // veta vem hon ar utan att hon skriver sin adress igen.
  try {
    properties.token = tokenForEmail(email);
  } catch (e) {
    // Saknad hemlighet ska inte stoppa leveransen - mailet ar viktigare an
    // att lanken kan hoppa over ett steg.
    console.error("[form-delivery] kunde inte signera kundtoken:", e);
  }

  if (cfg.seriesField) {
    const series = await fetchImageSeries(form.id, email, cfg.seriesField);
    properties.antal_bilder = series.length;
    // Namngivna nycklar, inte en array: Klaviyos malleditor kan inte indexera
    // en lista i en <img src>, men {{ event.bild_1_url }} fungerar rakt av.
    for (const shot of series) {
      if (shot.step) properties[`bild_${shot.step}_url`] = shot.url;
    }
    // Och i ordning, för mallar som hellre vill ha "senaste" oavsett steg.
    series.forEach((shot, i) => {
      properties[`serie_${i + 1}_url`] = shot.url;
    });
  }

  await trackKlaviyoEvent({
    brand: cfg.brand,
    metricName: cfg.metric,
    email,
    properties,
    time: submission.created_at,
    uniqueId: submission.client_submission_id,
  });

  return { ticketId: null };
}

export async function deliverSubmission(submissionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerSupabase();

  const { data: submission, error: subErr } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", submissionId)
    .single<FormSubmissionRow>();
  if (subErr || !submission) return { ok: false, error: `Submission not found: ${subErr?.message}` };

  if (submission.delivery_status === "delivered" || submission.delivery_status === "skipped") {
    return { ok: true };
  }
  // Test submissions verify the capture chain only - never create tickets.
  if (submission.is_test) {
    await supabase
      .from("form_submissions")
      .update({ delivery_status: "skipped", last_error: null })
      .eq("id", submissionId);
    return { ok: true };
  }

  // Atomic claim. The status check above is a read, so two concurrent callers -
  // this submission's own after() and ANOTHER request's sweepPendingDeliveries()
  // - could both pass it and both create a ticket. That is not theoretical: the
  // SB seed's E2E run on 2026-09-14 produced 5 tickets for 3 submissions.
  // A conditional UPDATE is applied atomically per row by Postgres, so exactly
  // one caller wins. The lease rides on next_retry_at, which the sweep already
  // honours, so no schema change is needed. A crash mid-delivery just lets the
  // lease lapse and the next sweep retries.
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + DELIVERY_LEASE_MINUTES * 60 * 1000).toISOString();
  const { data: claimed } = await supabase
    .from("form_submissions")
    .update({ next_retry_at: leaseUntil })
    .eq("id", submissionId)
    .eq("delivery_status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`)
    .select("id");
  if (!claimed || claimed.length === 0) {
    // Another caller holds this row (or it just finished). Not an error.
    return { ok: true };
  }

  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("*")
    .eq("id", submission.form_id)
    .single<FormRow>();
  if (formErr || !form) return { ok: false, error: `Form not found: ${formErr?.message}` };

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug, settings")
    .eq("id", submission.workspace_id)
    .single<{ id: string; slug: string; settings: Record<string, unknown> | null }>();

  const helpdesk = (workspace?.settings?.forms_helpdesk as HelpdeskConfig | undefined) ?? {
    type: "freshdesk",
    account: "renew",
  };

  const config: FormConfig = form.config;
  const email = submission.email ?? extractEmail(config, submission.payload);
  if (!email) {
    // Unrecoverable - no requester to open a ticket for. Mark failed + alert.
    await supabase
      .from("form_submissions")
      .update({ delivery_status: "failed", last_error: "Ingen e-postadress i submissionen" })
      .eq("id", submissionId);
    await alertDeliveryFailure(submission, form.name, "Ingen e-postadress i submissionen");
    return { ok: false, error: "No email in submission" };
  }

  const subject = buildTicketSubject(form.name, config, submission.payload);
  const description = buildTicketDescription(form.name, submission.payload, submission.files ?? []);
  const internalNote = buildInternalNote(form.name, {
    submissionId: submission.client_submission_id,
    submittedAt: submission.created_at,
    market: submission.market,
  });

  const input: DeliveryInput = {
    submission,
    form,
    subject,
    description,
    internalNote,
    email,
    customerName: submission.name,
  };

  try {
    let result: DeliveryResult;
    const delivery = config.delivery;
    if (typeof delivery === "object" && delivery?.type === "klaviyo") {
      result = await deliverViaKlaviyo(input, delivery);
    } else if (helpdesk.type === "freshdesk") {
      result = await deliverViaFreshdesk(input, helpdesk);
    } else if (helpdesk.type === "email") {
      result = await deliverViaEmail(input, helpdesk.to);
    } else {
      throw new Error(`Unknown helpdesk type: ${JSON.stringify(helpdesk)}`);
    }

    await supabase
      .from("form_submissions")
      .update({
        delivery_status: "delivered",
        delivered_at: new Date().toISOString(),
        ticket_id: result.ticketId,
        last_error: null,
        next_retry_at: null,
      })
      .eq("id", submissionId);
    console.log(`[form-delivery] Delivered submission ${submissionId} (${form.slug}) -> ticket ${result.ticketId ?? "email"}`);
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const attempts = submission.delivery_attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;

    await supabase
      .from("form_submissions")
      .update({
        delivery_status: exhausted ? "failed" : "pending",
        delivery_attempts: attempts,
        last_error: errMsg.slice(0, 500),
        next_retry_at: exhausted
          ? null
          : new Date(Date.now() + nextRetryDelayMinutes(attempts) * 60 * 1000).toISOString(),
      })
      .eq("id", submissionId);

    console.error(`[form-delivery] Delivery failed for ${submissionId} (attempt ${attempts}/${MAX_ATTEMPTS}): ${errMsg}`);
    if (exhausted) await alertDeliveryFailure(submission, form.name, errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * Retry due pending deliveries. Called from the reconcile-stuck-jobs cron and
 * opportunistically after each new submission (self-healing at low volume even
 * if crons misbehave). Returns number of attempted deliveries.
 */
export async function sweepPendingDeliveries(limit = 5): Promise<number> {
  const supabase = createServerSupabase();
  const { data: due } = await supabase
    .from("form_submissions")
    .select("id")
    .eq("delivery_status", "pending")
    .eq("is_test", false)
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!due || due.length === 0) return 0;
  let attempted = 0;
  for (const row of due) {
    attempted++;
    await deliverSubmission(row.id);
  }
  return attempted;
}

/**
 * Daily synthetic end-to-end test: inserts an is_test submission for one
 * published form and verifies it landed in the table. Broken capture chain
 * (bad config, DB error, schema drift) fires a critical alert within a day
 * instead of being discovered by a customer. Old test rows are pruned.
 */
export async function runSyntheticFormTest(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerSupabase();
  try {
    const { data: form, error: formErr } = await supabase
      .from("forms")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .limit(1)
      .single<FormRow>();
    if (formErr || !form) throw new Error(`No published form to test: ${formErr?.message}`);

    const clientId = `synthetic-${new Date().toISOString().slice(0, 10)}`;
    const { error: insErr } = await supabase.from("form_submissions").upsert(
      {
        form_id: form.id,
        workspace_id: form.workspace_id,
        market: form.market,
        client_submission_id: clientId,
        payload: [{ key: "synthetic", label: "Syntetiskt test", value: "ok" }],
        email: "synthetic-test@internal.local",
        is_test: true,
        delivery_status: "skipped",
        meta: { synthetic: true },
      },
      { onConflict: "client_submission_id", ignoreDuplicates: true }
    );
    if (insErr) throw new Error(`Synthetic insert failed: ${insErr.message}`);

    const { data: check, error: checkErr } = await supabase
      .from("form_submissions")
      .select("id")
      .eq("client_submission_id", clientId)
      .single();
    if (checkErr || !check) throw new Error(`Synthetic row not readable: ${checkErr?.message}`);

    // Prune synthetic rows older than 7 days
    await supabase
      .from("form_submissions")
      .delete()
      .eq("is_test", true)
      .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      await sendTelegramNotification(
        chatId,
        `<b>🚨 Formulär: syntetiskt test FAILED</b>\nKedjan config → insert är trasig: <code>${tgEscape(errMsg.slice(0, 250))}</code>\nKundformulär kan vara nere - kolla direkt.`,
        { critical: true }
      );
    }
    console.error(`[form-delivery] Synthetic test failed: ${errMsg}`);
    return { ok: false, error: errMsg };
  }
}
