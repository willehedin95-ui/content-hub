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
import { sendTelegramNotification, escapeHtml as tgEscape } from "@/lib/telegram";
import {
  buildTicketSubject,
  buildTicketDescription,
  extractEmail,
} from "@/lib/form-utils";
import type {
  FormConfig,
  FormRow,
  FormSubmissionRow,
  HelpdeskConfig,
} from "@/types/forms";

const MAX_ATTEMPTS = 8;

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
  email: string;
  customerName: string | null;
}

interface DeliveryResult {
  ticketId: string | null;
}

async function deliverViaFreshdesk(
  input: DeliveryInput,
  account: "renew" | "sb"
): Promise<DeliveryResult> {
  const domain = (account === "sb" ? process.env.FRESHDESK_SB_DOMAIN : process.env.FRESHDESK_RENEW_DOMAIN)?.trim();
  const apiKey = (account === "sb" ? process.env.FRESHDESK_SB_API_KEY : process.env.FRESHDESK_RENEW_API_KEY)?.trim();
  if (!domain || !apiKey) {
    throw new Error(`Freshdesk not configured for account "${account}" (missing env vars)`);
  }

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
  const ticket = (await res.json()) as { id: number };
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
  const description = buildTicketDescription(form.name, submission.payload, submission.files ?? [], {
    submissionId: submission.client_submission_id,
    submittedAt: submission.created_at,
    market: submission.market,
  });

  const input: DeliveryInput = {
    submission,
    form,
    subject,
    description,
    email,
    customerName: submission.name,
  };

  try {
    let result: DeliveryResult;
    if (helpdesk.type === "freshdesk") {
      result = await deliverViaFreshdesk(input, helpdesk.account);
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
