import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";

// GET /api/copy-bank?product=X&language=Y&segment_id=Z
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product");
  const language = searchParams.get("language");
  const segmentId = searchParams.get("segment_id");

  const db = createServerSupabase();

  let query = db
    .from("copy_bank")
    .select("*, segment:product_segments(id, name)")
    .order("created_at", { ascending: false });

  if (product) query = query.eq("product", product);
  if (language) query = query.eq("language", language);
  if (segmentId && isValidUUID(segmentId)) query = query.eq("segment_id", segmentId);

  const { data, error } = await query;

  if (error) return safeError(error, "Failed to fetch copy bank");

  return NextResponse.json(data ?? []);
}

// POST /api/copy-bank
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { product, language, primary_text, headline, segment_id, source_meta_ad_id, source_concept_name, notes } = body;

  if (!product || !language || !primary_text) {
    return NextResponse.json(
      { error: "product, language, and primary_text are required" },
      { status: 400 }
    );
  }

  if (segment_id && !isValidUUID(segment_id)) {
    return NextResponse.json({ error: "Invalid segment_id" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("copy_bank")
    .upsert(
      {
        product,
        language,
        primary_text: primary_text.trim(),
        headline: headline?.trim() || null,
        segment_id: segment_id || null,
        source_meta_ad_id: source_meta_ad_id || null,
        source_concept_name: source_concept_name || null,
        notes: notes || null,
      },
      { onConflict: "product,language,primary_text" }
    )
    .select("*, segment:product_segments(id, name)")
    .single();

  if (error) return safeError(error, "Failed to save to copy bank");

  return NextResponse.json(data, { status: 201 });
}
