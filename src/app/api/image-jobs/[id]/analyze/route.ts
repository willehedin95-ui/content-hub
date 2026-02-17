import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { analyzeTranslationQuality } from "@/lib/quality-analysis";
import { calcOpenAICost } from "@/lib/pricing";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { versionId } = (await req.json()) as { versionId: string };

  if (!versionId) {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Look up the version and its parent translation + source image
  const { data: version, error: vError } = await db
    .from("versions")
    .select(`*, image_translations!inner(id, language, source_image_id, source_images!inner(id, original_url, job_id))`)
    .eq("id", versionId)
    .single();

  if (vError || !version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.image_translations.source_images.job_id !== jobId) {
    return NextResponse.json({ error: "Version does not belong to this job" }, { status: 400 });
  }

  if (!version.translated_url) {
    return NextResponse.json({ error: "Version has no translated image" }, { status: 400 });
  }

  const originalUrl = version.image_translations.source_images.original_url;
  const language = version.image_translations.language;

  try {
    const { analysis, inputTokens, outputTokens } = await analyzeTranslationQuality(
      originalUrl,
      version.translated_url,
      language
    );

    // Update version with analysis results
    await db
      .from("versions")
      .update({
        quality_score: analysis.quality_score,
        quality_analysis: analysis,
        extracted_text: analysis.extracted_text,
      })
      .eq("id", versionId);

    // Log usage
    const cost = calcOpenAICost(inputTokens, outputTokens);
    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: "gpt-4o-vision",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      metadata: {
        purpose: "quality_analysis",
        image_job_id: jobId,
        version_id: versionId,
        image_translation_id: version.image_translations.id,
        quality_score: analysis.quality_score,
      },
    });

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quality analysis failed" },
      { status: 500 }
    );
  }
}
