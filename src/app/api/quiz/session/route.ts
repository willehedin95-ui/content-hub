// POST /api/quiz/session
// Called by the quiz runtime on page load to create a session row.
// CORS-friendly - called from CF Pages domains.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getCORSHeaders, handleOptions } from "../_cors";

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return handleOptions(origin);
}

type SessionBody = {
  quizId: string;
  variant_assignments: Record<string, string>;
  utm?: Record<string, string>;
  ua?: string;
  market?: string;
};

function detectDeviceType(ua: string): "mobile" | "tablet" | "desktop" {
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return "mobile";
  if (/iPad|Tablet/.test(ua)) return "tablet";
  return "desktop";
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCORSHeaders(origin);

  const body = (await req.json().catch(() => null)) as SessionBody | null;

  if (!body?.quizId) {
    return NextResponse.json(
      { error: "quizId is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const ua = body.ua ?? req.headers.get("user-agent") ?? "";
  const deviceType = detectDeviceType(ua);
  const referrer = req.headers.get("referer") ?? null;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("quiz_sessions")
    .insert({
      quiz_id: body.quizId,
      variant_assignments: body.variant_assignments ?? {},
      utm: body.utm ?? null,
      user_agent: ua || null,
      market: body.market ?? null,
      device_type: deviceType,
      referrer,
    })
    .select("id")
    .single();

  if (error) {
    const res = safeError(error, "Failed to create session");
    const json = await res.json();
    return NextResponse.json(json, { status: 500, headers: corsHeaders });
  }

  return NextResponse.json({ session_id: data.id }, { headers: corsHeaders });
}
