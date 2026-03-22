import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { isValidUUID } from "@/lib/validation";
import type { ConceptCopyTranslation } from "@/types";

/**
 * Approve translations that are in "review" status.
 * POST body: { language?: string }
 * - If language is provided, approves only that language
 * - If omitted, approves ALL languages in "review" status
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
  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, ad_copy_translations")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const translations = { ...(job.ad_copy_translations as Record<string, ConceptCopyTranslation> ?? {}) };
  let approved = 0;

  for (const [key, value] of Object.entries(translations)) {
    if (value.status === "review" && (!lang || key === lang)) {
      translations[key] = { ...value, status: "completed" };
      approved++;
    }
  }

  if (approved === 0) {
    return NextResponse.json({ error: "No translations in review status" }, { status: 400 });
  }

  await db
    .from("image_jobs")
    .update({ ad_copy_translations: translations })
    .eq("id", jobId);

  return NextResponse.json({ success: true, approved });
}
