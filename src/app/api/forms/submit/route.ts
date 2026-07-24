// Public: receives a form submission from the embed runtime.
//
// The critical path is deliberately tiny: validate -> INSERT -> 200.
// Helpdesk delivery runs after the response (after()) with a cron-backed
// retry sweep as safety net - a helpdesk outage can never lose a submission.
//
// Spam posture: honeypot field + per-IP hourly rate limit + optional
// Cloudflare Turnstile (activates when TURNSTILE_SECRET_KEY is set).

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { deliverSubmission, sweepPendingDeliveries } from "@/lib/form-delivery";
import {
  evaluateDateGate,
  extractEmail,
  extractOrderNumber,
  buildFullName,
  findMissingRequired,
} from "@/lib/form-utils";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";
import type { FormRow, SubmissionAnswer, SubmissionFile } from "@/types/forms";

export const maxDuration = 30;

const RATE_LIMIT_PER_HOUR = 20;

interface SubmitBody {
  workspace?: string;
  slug?: string;
  market?: string;
  clientSubmissionId?: string;
  answers?: SubmissionAnswer[];
  files?: SubmissionFile[];
  turnstileToken?: string;
  /** Honeypot - real users never fill this. */
  website?: string;
}

function ipHash(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

async function verifyTurnstile(token: string | undefined, req: NextRequest): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true; // Not configured -> skip (honeypot + rate limit still active)
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Turnstile outage should not take the form down - honeypot + rate limit remain
    return true;
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400, headers: cors });
  }

  // Honeypot: pretend success so bots move on, insert nothing.
  if (body.website && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, id: "ok" }, { headers: cors });
  }

  const workspaceSlug = (body.workspace || "").trim().toLowerCase();
  const slug = (body.slug || "").trim().toLowerCase();
  const market = (body.market || "se").trim().toLowerCase();
  const clientSubmissionId = (body.clientSubmissionId || "").trim();
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const files = Array.isArray(body.files) ? body.files.slice(0, 10) : [];

  if (!workspaceSlug || !slug || !clientSubmissionId || answers.length === 0) {
    return NextResponse.json({ error: "Ofullständig förfrågan" }, { status: 400, headers: cors });
  }
  if (clientSubmissionId.length > 100 || answers.length > 60) {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400, headers: cors });
  }

  if (!(await verifyTurnstile(body.turnstileToken, req))) {
    return NextResponse.json({ error: "Kunde inte verifiera att du är människa. Ladda om sidan och försök igen." }, { status: 403, headers: cors });
  }

  const supabase = createServerSupabase();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .single<{ id: string }>();
  if (!workspace) {
    return NextResponse.json({ error: "Okänt formulär" }, { status: 404, headers: cors });
  }

  const { data: form } = await supabase
    .from("forms")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("slug", slug)
    .eq("market", market)
    .eq("status", "published")
    .single<FormRow>();
  if (!form) {
    return NextResponse.json({ error: "Okänt formulär" }, { status: 404, headers: cors });
  }

  // Rate limit per IP-hash (stored in meta, never the raw IP)
  const hash = ipHash(req);
  const { count } = await supabase
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("meta->>ip_hash", hash)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: "För många försök. Vänta en stund och försök igen." }, { status: 429, headers: cors });
  }

  // Server-side required check (client validates first; this catches tampering)
  const missing = findMissingRequired(form.config, answers);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Obligatoriska fält saknas: ${missing.join(", ")}` },
      { status: 400, headers: cors }
    );
  }

  const email = extractEmail(form.config, answers);
  if (!email) {
    return NextResponse.json({ error: "Ange en giltig e-postadress." }, { status: 400, headers: cors });
  }

  const gate = evaluateDateGate(form.config, answers);
  const name = buildFullName(form.config, answers);
  const orderNumber = extractOrderNumber(form.config, answers);

  // Persist-first. Idempotent on client_submission_id: double-clicks and
  // network retries can never create duplicate rows (or duplicate tickets).
  const { error: insErr } = await supabase.from("form_submissions").upsert(
    {
      form_id: form.id,
      workspace_id: workspace.id,
      market,
      client_submission_id: clientSubmissionId,
      payload: answers,
      email,
      name,
      order_number: orderNumber,
      files,
      meta: {
        ip_hash: hash,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
        origin: req.headers.get("origin") || null,
      },
      gate_status: gate,
      delivery_status: gate ? "skipped" : "pending",
    },
    { onConflict: "client_submission_id", ignoreDuplicates: true }
  );
  if (insErr) {
    console.error(`[forms/submit] Insert failed: ${insErr.message}`);
    return NextResponse.json(
      { error: "Något gick fel. Försök igen om en stund." },
      { status: 500, headers: cors }
    );
  }

  const { data: row } = await supabase
    .from("form_submissions")
    .select("id, gate_status, delivery_status")
    .eq("client_submission_id", clientSubmissionId)
    .single<{ id: string; gate_status: string | null; delivery_status: string }>();

  // Deliver after the response + opportunistically sweep old pending rows.
  if (row && !gate) {
    const submissionId = row.id;
    after(async () => {
      try {
        await deliverSubmission(submissionId);
        await sweepPendingDeliveries(3);
      } catch (e) {
        console.error(`[forms/submit] after() delivery error:`, e);
      }
    });
  }

  return NextResponse.json({ ok: true, id: row?.id ?? null, gate: row?.gate_status ?? gate }, { headers: cors });
}
