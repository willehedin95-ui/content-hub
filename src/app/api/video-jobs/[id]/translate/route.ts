import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { OPENAI_MODEL } from "@/lib/constants";
import { extractDialogue, replaceDialogue } from "@/lib/video-brainstorm";
import { formatRules } from "@/lib/translation-rules";
import OpenAI from "openai";

export const maxDuration = 60;

const LANG_NAMES: Record<string, string> = {
  sv: "Swedish",
  no: "Norwegian (Bokmål)",
  da: "Danish",
};

const LANG_NATIVE: Record<string, string> = {
  sv: "svenska",
  no: "norsk (bokmål)",
  da: "dansk",
};

const LANG_COUNTRIES: Record<string, string> = {
  sv: "Sweden",
  no: "Norway",
  da: "Denmark",
};

const FILLER_WORDS: Record<string, string> = {
  sv: '"liksom", "vet du", "men", "faktiskt", "alltså" (sparingly)',
  no: '"liksom", "altså", "på en måte", "vet du", "egentlig"',
  da: '"altså", "liksom", "ikke", "jo", "bare"',
};

function buildTranslationPrompt(sourceLang: string, targetLang: string): string {
  const sourceName = LANG_NAMES[sourceLang] || sourceLang;
  const targetName = LANG_NAMES[targetLang] || targetLang;
  const targetNative = LANG_NATIVE[targetLang] || targetLang;
  const country = LANG_COUNTRIES[targetLang] || targetLang;
  const fillers = FILLER_WORDS[targetLang] || '"um", "like"';

  return `You are a senior native ${targetName} (${targetNative}) copywriter who specializes in SPOKEN DIALOGUE for video ads. You understand exactly how real people in ${country} talk.

TASK:
You receive a JSON object with ${sourceName} text values from a video ad script. Translate each value into natural, authentic ${targetName} AS SPOKEN BY A REAL PERSON.

THIS IS SPOKEN DIALOGUE — not written copy. It must sound like a real ${targetName} person naturally speaks.

KEY PRINCIPLES:
1) Translate how a 30-year-old in ${country} would ACTUALLY SAY this to their friend.
2) Use native ${targetName} filler words: ${fillers}. Replace source filler words with natural ${targetName} equivalents.
3) Keep sentences SHORT and conversational.
4) Avoid literal translations that sound "dubbed". Rewrite completely if a direct translation sounds stiff.
5) No teen slang. Target age ~30-50.
6) Keep delivery notes in [brackets] in English as-is.
7) Keep pauses (...) and self-corrections as they are.
8) Keep [SHOT 1], [SHOT 2] etc. markers exactly as-is.
9) Preserve meaning and sales intent 1:1, but the WAY it's said must be 100% natural ${targetName}.

${formatRules()}

Keep brand names unchanged: HappySleep, Hydro13, SwedishBalance, Nordic Cradle, HappySleep Ergo, Hälsobladet.
Keep person/character names exactly as-is.

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated ${targetName} values.
No explanations, no comments, no extra keys.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const targetLang = body.language as string;

  if (!targetLang || !["sv", "no", "da"].includes(targetLang)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  const db = createServerSupabase();

  // 1. Fetch video job with shots and existing translations
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, video_shots(*), video_translations(*)")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  // Check if translation already exists for this language
  const existing = (job.video_translations || []).find(
    (t: { language: string }) => t.language === targetLang
  );
  if (existing) {
    return NextResponse.json({ error: "Translation already exists for this language" }, { status: 409 });
  }

  // Determine source language from the job's target_languages
  const sourceLang = job.target_languages?.[0] || "sv";
  if (sourceLang === targetLang) {
    return NextResponse.json({ error: "Cannot translate to the same language" }, { status: 400 });
  }

  // 2. Build translatable text map
  const translatableTexts: Record<string, string> = {};

  if (job.script) translatableTexts["script"] = job.script;
  if (job.ad_copy_primary?.length) {
    job.ad_copy_primary.forEach((text: string, i: number) => {
      if (text) translatableTexts[`ad_copy_primary_${i}`] = text;
    });
  }
  if (job.ad_copy_headline?.length) {
    job.ad_copy_headline.forEach((text: string, i: number) => {
      if (text) translatableTexts[`ad_copy_headline_${i}`] = text;
    });
  }

  // Extract dialogue from each shot's veo_prompt
  const shots = (job.video_shots || []).sort(
    (a: { shot_number: number }, b: { shot_number: number }) => a.shot_number - b.shot_number
  );

  for (const shot of shots) {
    const dialogue = extractDialogue(shot.veo_prompt || "");
    if (dialogue) {
      translatableTexts[`shot_${shot.shot_number}_dialogue`] = dialogue;
    }
  }

  if (Object.keys(translatableTexts).length === 0) {
    return NextResponse.json({ error: "No translatable text found" }, { status: 400 });
  }

  // 3. Translate via GPT
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const client = new OpenAI({ apiKey });
  const systemPrompt = buildTranslationPrompt(sourceLang, targetLang);

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(translatableTexts) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return NextResponse.json({ error: "No translation response" }, { status: 500 });

  const translated = JSON.parse(content) as Record<string, string>;

  // 4. Build translated_shots array
  const translatedShots = shots.map((shot: { shot_number: number; veo_prompt: string }) => {
    const translatedDialogue = translated[`shot_${shot.shot_number}_dialogue`] || "";
    const translatedVeoPrompt = translatedDialogue
      ? replaceDialogue(shot.veo_prompt || "", translatedDialogue)
      : shot.veo_prompt || "";

    return {
      shot_number: shot.shot_number,
      translated_dialogue: translatedDialogue,
      translated_veo_prompt: translatedVeoPrompt,
    };
  });

  // 5. Build translated ad copy arrays
  const translatedAdCopyPrimary = (job.ad_copy_primary || []).map(
    (_: string, i: number) => translated[`ad_copy_primary_${i}`] || ""
  );
  const translatedAdCopyHeadline = (job.ad_copy_headline || []).map(
    (_: string, i: number) => translated[`ad_copy_headline_${i}`] || ""
  );

  // 6. Insert video_translation row
  const { data: translation, error: insertError } = await db
    .from("video_translations")
    .insert({
      video_job_id: id,
      language: targetLang,
      translated_script: translated["script"] || null,
      translated_sora_prompt: null,
      translated_shots: translatedShots,
      status: "completed",
    })
    .select()
    .single();

  if (insertError) return safeError(insertError, "Failed to save translation", 500);

  // 7. Log usage
  await db.from("usage_logs").insert({
    type: "video_translation",
    model: OPENAI_MODEL,
    input_tokens: response.usage?.prompt_tokens ?? 0,
    output_tokens: response.usage?.completion_tokens ?? 0,
    cost_usd:
      (response.usage?.prompt_tokens ?? 0) * 0.000005 +
      (response.usage?.completion_tokens ?? 0) * 0.000015,
    metadata: {
      video_job_id: id,
      source_language: sourceLang,
      target_language: targetLang,
    },
  });

  return NextResponse.json({
    translation: {
      ...translation,
      translated_ad_copy_primary: translatedAdCopyPrimary,
      translated_ad_copy_headline: translatedAdCopyHeadline,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");

  if (!language) {
    return NextResponse.json({ error: "language query param is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { error } = await db
    .from("video_translations")
    .delete()
    .eq("video_job_id", id)
    .eq("language", language);

  if (error) {
    return safeError(error, "Failed to delete translation");
  }

  return NextResponse.json({ success: true });
}
