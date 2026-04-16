import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { isValidUUID } from "@/lib/validation";

/**
 * Approve translations that are in "review" status.
 * POST body: { language?: string }
 * - If language is provided, approves only that language
 * - If omitted, approves ALL languages in "review" status
 *
 * 2026-04-16: Uses `approve_ad_copy_translations` RPC to flip review -> completed
 * server-side atomically, instead of client-side read-modify-write. Prevents
 * races with concurrent translate-copy/autopilot writers.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const lang = body.language as string | undefined;

  const db = createServerSupabase();
  const { data, error } = await db.rpc("approve_ad_copy_translations", {
    p_job_id: jobId,
    p_language: lang ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data === null) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const result = data as { approved_count: number };
  if (result.approved_count === 0) {
    return NextResponse.json({ error: "No translations in review status" }, { status: 400 });
  }

  return NextResponse.json({ success: true, approved: result.approved_count });
}
