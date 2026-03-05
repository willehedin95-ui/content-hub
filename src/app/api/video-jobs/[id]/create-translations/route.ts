import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";

const anthropic = new Anthropic();

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch video job with source videos
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, source_videos(*)")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);
  if (!job.script || !job.sora_prompt) {
    return NextResponse.json({ error: "Job must have script and prompt before creating translations" }, { status: 400 });
  }

  const sourceVideo = job.source_videos?.find((sv: { status: string }) => sv.status === "completed");

  // 2. Translate for each target language
  const created: string[] = [];

  for (const lang of job.target_languages || []) {
    // Check if translation already exists
    const { data: existing } = await db
      .from("video_translations")
      .select("id")
      .eq("video_job_id", id)
      .eq("language", lang)
      .single();

    if (existing) continue;

    const langMap: Record<string, string> = { sv: "Swedish", no: "Norwegian", da: "Danish", de: "German" };
    const langName = langMap[lang] || lang;

    // Claude translates both script and Sora prompt
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: `You are a professional translator specializing in advertising copy. Translate UGC video scripts and Sora 2 prompts to ${langName}.

Rules:
- Keep the conversational, authentic tone — this is UGC, not formal copy
- Replace English filler words with natural ${langName} equivalents (${lang === "no" ? '"liksom", "altså", "på en måte"' : lang === "da" ? '"altså", "liksom", "ikke"' : lang === "sv" ? '"liksom", "alltså", "typ"' : '"also", "sozusagen"'})
- Adapt character ethnicity/name to match ${langName}-speaking market
- Adapt setting details (local stores, apartment style) to ${langName} market
- Keep the Sora prompt structure identical — only translate the dialogue, character name, and setting details
- Keep all technical cinematography terms in English
- Delivery style notes in [brackets] should remain in English

Return JSON:
{
  "translated_script": "...",
  "translated_sora_prompt": "..."
}

Return ONLY valid JSON. No markdown fences.`,
      messages: [
        {
          role: "user",
          content: `Translate this UGC video concept to ${langName}:

SCRIPT:
${job.script}

SORA PROMPT:
${job.sora_prompt}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "");
    const parsed = JSON.parse(cleaned);

    const { error: insertError } = await db.from("video_translations").insert({
      video_job_id: id,
      source_video_id: sourceVideo?.id || null,
      language: lang,
      translated_script: parsed.translated_script,
      translated_sora_prompt: parsed.translated_sora_prompt,
      status: "pending",
    });

    if (!insertError) created.push(lang);

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_translation",
      model: CLAUDE_MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd:
        (response.usage.input_tokens * 3) / 1_000_000 +
        (response.usage.output_tokens * 15) / 1_000_000,
      metadata: { video_job_id: id, language: lang },
    });
  }

  // Update job status
  if (created.length > 0) {
    await db.from("video_jobs").update({ status: "translating" }).eq("id", id);
  }

  return NextResponse.json({ created: created.length, languages: created });
}
