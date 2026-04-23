// POST /api/quiz/events
// Batch event ingestion from the quiz runtime.
// Rate-limited to 60 requests/minute per IP (simple in-memory, Node runtime).
// CORS-friendly - called from CF Pages domains.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getCORSHeaders, handleOptions } from "../_cors";

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return handleOptions(origin);
}

// ---------------------------------------------------------------------------
// In-memory rate limiter (60 req/min per IP)
// ---------------------------------------------------------------------------

const RATE_LIMIT = 60; // requests per window
const WINDOW_MS = 60_000; // 1 minute

type RateEntry = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateEntry>();

// Cleanup stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (entry.resetAt < now) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
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
]);

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCORSHeaders(origin);

  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: corsHeaders },
    );
  }

  const body = (await req.json().catch(() => null)) as EventsBody | null;

  if (!body?.session_id || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "session_id and events[] are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (body.events.length === 0) {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
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

  // Filter and validate events
  const rows = body.events
    .filter((e) => VALID_EVENT_TYPES.has(e.event_type))
    .map((e) => ({
      session_id: body.session_id,
      quiz_id: session.quiz_id as string,
      event_type: e.event_type,
      step_id: e.step_id ?? null,
      variant_group_id: e.variant_group_id ?? null,
      option_id: e.option_id ?? null,
      meta: e.meta ?? null,
    }));

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
