// POST /api/quiz/events
// Batch event ingestion from the quiz runtime.
// Rate-limited to 300 requests/minute per session_id (falls back to IP when
// the body carries no session). Keying on session instead of IP matters for
// mobile FB/IG traffic behind CGNAT, where thousands of visitors share one
// IP and a spike turned into 429s + permanently dropped beacon flushes.
// CORS-friendly - called from CF Pages domains.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getCORSHeaders, handleOptions } from "../_cors";
import { isBlockedIP } from "../_block-ip";

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return handleOptions(origin);
}

// ---------------------------------------------------------------------------
// In-memory rate limiter (300 req/min per session_id, IP fallback)
// ---------------------------------------------------------------------------

const RATE_LIMIT = 300; // requests per window
const WINDOW_MS = 60_000; // 1 minute

type RateEntry = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateEntry>();

// Cleanup stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt < now) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type EventInput = {
  event_type: string;
  step_id?: string;
  variant_group_id?: string;
  option_id?: string;
  meta?: Record<string, unknown>;
};

type EventsBody = {
  session_id: string;
  events: EventInput[];
};

const VALID_EVENT_TYPES = new Set([
  "step_view",
  "answer",
  "email_capture",
  "back",
  "exit_click",
  "abandon",
  "purchase", // Logged by /api/quiz/shopify-webhook on order/create
  "cta_click", // Fired by offer-page custom_html via postMessage `quiz-runtime-event`
               // when the primary CTA is clicked. Used for variant CTR analysis.
]);

const MAX_EVENTS_PER_REQUEST = 50;
const MAX_META_BYTES = 8 * 1024; // ~8KB serialized meta per event

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCORSHeaders(origin);

  const body = (await req.json().catch(() => null)) as EventsBody | null;

  // Rate limiting: key on session_id (mobile FB/IG traffic shares CGNAT IPs),
  // fall back to IP when no session is present. Only UUID-shaped session ids
  // get their own bucket - arbitrary strings would let a hostile client mint
  // unlimited fresh buckets and grow the limiter map unbounded.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rateKey =
    body?.session_id && UUID_RE.test(body.session_id)
      ? `sid:${body.session_id}`
      : `ip:${ip}`;

  if (!checkRateLimit(rateKey)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: corsHeaders },
    );
  }

  if (!body?.session_id || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "session_id and events[] are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (body.events.length === 0) {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }

  // Cap batch size - a hostile/buggy client can't dump unbounded arrays.
  let incomingEvents = body.events;
  if (incomingEvents.length > MAX_EVENTS_PER_REQUEST) {
    console.warn(
      `[quiz/events] events[] capped: ${incomingEvents.length} -> ${MAX_EVENTS_PER_REQUEST} (session ${body.session_id})`,
    );
    incomingEvents = incomingEvents.slice(0, MAX_EVENTS_PER_REQUEST);
  }

  // Internal/test IPs are silently dropped here too. Their session_id from
  // /api/quiz/session was a fake UUID with no matching DB row anyway, but
  // bailing early avoids logging "Session not found" noise for our own tests.
  if (isBlockedIP(req)) {
    return NextResponse.json({ ok: true, _internal: true }, { headers: corsHeaders });
  }

  const db = createServerSupabase();

  // Verify session exists and get quiz_id (avoids orphaned inserts)
  const { data: session } = await db
    .from("quiz_sessions")
    .select("id, quiz_id")
    .eq("id", body.session_id)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  // Filter and validate events. Unknown event_types are dropped, but LOGGED
  // with counts - silent filtering is how cta_click went missing for weeks.
  const droppedTypeCounts = new Map<string, number>();
  let capturedEmail: string | null = null;
  const rows = incomingEvents
    .filter((e) => {
      if (VALID_EVENT_TYPES.has(e.event_type)) return true;
      const key = String(e.event_type);
      droppedTypeCounts.set(key, (droppedTypeCounts.get(key) ?? 0) + 1);
      return false;
    })
    .map((e) => {
      let meta: Record<string, unknown> | null = e.meta ?? null;
      // Never persist plaintext email in quiz_events.meta - keep it on the
      // session row only (updated below).
      if (meta && e.event_type === "email_capture" && typeof meta.email === "string") {
        capturedEmail = meta.email;
        const { email: _email, ...rest } = meta;
        meta = Object.keys(rest).length > 0 ? rest : null;
      }
      // Cap serialized meta size (~8KB) so one event can't bloat the table.
      if (meta) {
        try {
          if (JSON.stringify(meta).length > MAX_META_BYTES) {
            console.warn(
              `[quiz/events] meta dropped (> ${MAX_META_BYTES} bytes) for ${e.event_type} (session ${body.session_id})`,
            );
            meta = null;
          }
        } catch {
          meta = null; // circular/unserializable - drop
        }
      }
      return {
        session_id: body.session_id,
        quiz_id: session.quiz_id as string,
        event_type: e.event_type,
        step_id: e.step_id ?? null,
        variant_group_id: e.variant_group_id ?? null,
        option_id: e.option_id ?? null,
        meta,
      };
    });

  if (droppedTypeCounts.size > 0) {
    const summary = Array.from(droppedTypeCounts.entries())
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    console.warn(`[quiz/events] dropped unknown event_types: ${summary} (session ${body.session_id})`);
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }

  const { error } = await db.from("quiz_events").insert(rows);

  if (error) {
    console.error("[quiz/events] Insert error:", error.message);
    return NextResponse.json(
      { error: "Failed to save events" },
      { status: 500, headers: corsHeaders },
    );
  }

  // Email stripped from event meta above - persist it on the session instead.
  if (capturedEmail) {
    const { error: emailErr } = await db
      .from("quiz_sessions")
      .update({ email: capturedEmail })
      .eq("id", body.session_id);
    if (emailErr) console.error("[quiz/events] session email update failed:", emailErr.message);
  }

  // Handle exit_click event: mark session as completed
  const hasExitClick = rows.some((r) => r.event_type === "exit_click");
  if (hasExitClick) {
    await db
      .from("quiz_sessions")
      .update({ exit_clicked: true, completed_at: new Date().toISOString() })
      .eq("id", body.session_id);
  }

  return NextResponse.json({ ok: true, count: rows.length }, { headers: corsHeaders });
}
