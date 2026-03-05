import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product");
  const status = searchParams.get("status");

  let query = db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*)")
    .order("created_at", { ascending: false });

  if (product) {
    query = query.eq("product", product);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return safeError(error, "Failed to fetch video jobs");
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();

  const { product, concept_name } = body;
  if (!product || !concept_name) {
    return NextResponse.json(
      { error: "product and concept_name are required" },
      { status: 400 }
    );
  }

  // Wrap single strings in arrays for ad copy fields
  const adCopyPrimary = body.ad_copy_primary
    ? Array.isArray(body.ad_copy_primary)
      ? body.ad_copy_primary
      : [body.ad_copy_primary]
    : [];

  const adCopyHeadline = body.ad_copy_headline
    ? Array.isArray(body.ad_copy_headline)
      ? body.ad_copy_headline
      : [body.ad_copy_headline]
    : [];

  const { data, error } = await db
    .from("video_jobs")
    .insert({
      product,
      concept_name,
      hook_type: body.hook_type || null,
      script_structure: body.script_structure || null,
      format_type: body.format_type || null,
      script: body.script || null,
      sora_prompt: body.sora_prompt || null,
      character_description: body.character_description || null,
      product_description: body.product_description || null,
      duration_seconds: body.duration_seconds ?? 12,
      target_languages: body.target_languages ?? [],
      status: "draft",
      awareness_level: body.awareness_level || null,
      style_notes: body.style_notes || null,
      ad_copy_primary: adCopyPrimary,
      ad_copy_headline: adCopyHeadline,
      landing_page_url: body.landing_page_url || null,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create video job");
  }

  return NextResponse.json(data, { status: 201 });
}
