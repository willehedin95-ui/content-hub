/**
 * Competitor video ad swipe pipeline.
 *
 * Two-model approach:
 * 1. Gemini 2.5 Pro watches the actual video (audio + visual) → transcribes
 *    script, identifies hook/format/delivery, describes character and setting
 * 2. Claude takes that analysis + UGC knowledge base → generates an adapted
 *    video concept with shots for our product
 * 3. Auto-generates shot keyframe images via Kie AI (Nano Banana)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendPhoto, sendMessageWithInlineKeyboard } from "@/lib/telegram";
import { callGeminiVideo, createImageTask, pollTaskResult } from "@/lib/kie";
import {
  loadVideoUgcContext,
  buildVideoUgcSystemPrompt,
} from "@/lib/video-brainstorm";
import { findBestLandingPage } from "@/lib/swipe-competitor";
import { CLAUDE_MODEL, STORAGE_BUCKET } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoSwipeInput {
  workspaceId: string;
  productSlug: string;
  competitorVideoUrl: string;
  competitorAdCopy?: string;
  brandName: string;
  videoDuration?: number;
  gethookdAdId?: number;
  notifyTelegram?: boolean;
  existingJobId?: string;
}

export interface VideoSwipeResult {
  videoJobId: string;
  conceptName: string;
  shotsCreated: number;
  shotImagesGenerated: number;
}

// ---------------------------------------------------------------------------
// Gemini prompt for video analysis
// ---------------------------------------------------------------------------

function buildVideoSwipeGeminiPrompt(): { system: string; user: string } {
  const system = `You are a UGC Video Deconstructor and Prompt Engineer. Your primary goal is to analyze any video, identify the specific characteristics that make it feel like authentic User-Generated Content (UGC), and reverse-engineer what makes it effective so we can create an ADAPTED version for a different product.

# ANALYSIS PROCESS

Watch the entire video carefully. Listen to every word. Observe every visual detail. Then provide a comprehensive deconstruction.

# OUTPUT FORMAT

Return valid JSON only (no markdown fences):

{
  "transcript": "Word-for-word transcription of ALL spoken dialogue. Include filler words (um, like, you know). Mark pauses as (pause). Annotate emotional tones in brackets like [enthusiastically], [nervous], [conspiratorial], [calm]. Label different speakers if multiple. If no speech, set to empty string.",
  "hook_first_3_seconds": "Exact transcription of what is said AND done in the first 3 seconds. This is the most critical part of the ad.",
  "big_idea": "The single core message of this ad in one sentence.",
  "hook_type": "problem_solution | promise | secret | discovery | social_proof | curiosity | confrontational",
  "format_type": "selfie_testimonial | street_interview | before_after | discovery | grwm | podcast_clip | product_demo | explainer | dorm_confessional | professor_lecture | grocery_approach | other",
  "delivery_style": "conversational | energetic | conspiratorial | emotional | authority | calm_intimate",
  "script_structure": "testimonial | insider_secret | discovery | before_after | street_interview | podcast",
  "character_description": "DETAILED character blueprint: approximate age, gender, ethnicity, hair style/color/length, eye color/shape, facial features (jawline, nose, skin tone/texture with visible pores and imperfections), build/posture, clothing (exact colors and style), accessories, mannerisms, emotional baseline, voice characteristics. Be extremely specific — enough to recreate this person in AI.",
  "setting": "DETAILED location: room type, background details (messy/clean, props visible, clutter like coffee cups, backpacks, unmade beds), time of day feel, lived-in authentic details.",
  "implied_device": "What camera was likely used based on aspect ratio, lens distortion, dynamic range, and artifacts.",
  "camera_setup": "Shot type (close-up/medium close-up/medium/wide), angle (below eye level/eye level/above), framing (centered/off-center/rule of thirds), camera motion (handheld sway and jitter/tripod/selfie grip wobble), orientation (vertical 9:16 / horizontal 16:9)",
  "lighting_analysis": "Light source type and direction (natural window, overhead, golden hour, ring light). How it illuminates the face (even/uneven/dramatic with side shadows). Shadow details. Professional or authentic feel.",
  "visual_style": "Overall aesthetic (professional/amateur/UGC), color grading, text overlays (yes/no and description), editing style (single take/jump cuts)",
  "audio_environment": "Background sounds (traffic, AC hum, cafe chatter), mic quality (phone mic echo, clear external mic), music (yes/no, type)",
  "product_interaction": "How product is held (two hands chest level, one hand at side, on desk), when first shown, how label is displayed, held throughout or briefly",
  "persuasion_analysis": "What psychological triggers does it use? Core promise? How does it build credibility? Call-to-action approach? The SINGLE most effective element.",
  "why_it_works": "In 2-3 sentences, the raw reason this video converts — the hook formula, emotional trigger, format choice.",
  "duration_seconds": 15,
  "scene_count": 1,
  "has_text_overlays": true,
  "has_music": false,
  "language": "en"
}

# RULES

- TRANSCRIBE EVERYTHING spoken — every word, every filler, every pause. This is the most important field.
- Annotate emotional delivery: [enthusiastically], [whispering], [concerned], [excited], [casual], [serious]
- Character description must be EXTREMELY detailed — facial features, exact clothing colors, hair details, skin texture, posture, mannerisms. This will be used to create an AI character.
- Setting must include "lived-in" authentic details, not just "bedroom" but specific props and clutter visible.
- Identify the hook formula: what pattern does the first 3 seconds follow?
- Product interaction timing: when is product first visible? How prominently displayed?
- Return ONLY valid JSON, no markdown fences`;

  const user = `Watch this competitor video ad carefully from start to finish. Listen to every single word spoken and observe every visual detail.

Your task:
1. TRANSCRIBE the complete spoken dialogue word-for-word with emotional annotations and pauses
2. EXTRACT the hook (first 3 seconds) and the big idea (core message)
3. DESCRIBE the character in enough detail to recreate them in AI (facial features, clothing, posture, voice)
4. ANALYZE the setting, lighting, camera work, audio environment, and product interaction
5. EXPLAIN why this ad is effective and what makes people stop scrolling

Return the structured JSON analysis.`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Image prompt builder (from shot-images/route.ts pattern)
// ---------------------------------------------------------------------------

function buildImagePrompt(
  shotDescription: string,
  charDesc: string | null,
  productDesc: string | null
): string {
  return [
    shotDescription,
    charDesc ? `\n\nCharacter: ${charDesc}.` : "",
    productDesc ? `\n\nProduct: ${productDesc}` : "",
    `\n\nYou are locked into a permanent capture style: Authentic iPhone front-camera photo realism.`,
    `Rules: Simulate Apple iPhone computational photography pipeline. No cinematic lighting, no flash, no studio lighting. No beauty filters, no symmetry correction, no pose optimization. Slight wide-angle distortion. Subtle edge sharpening. Flattened midtones. Mild overexposure on highlights. Natural shadow noise. Real skin texture (pores, creases, uneven tone). Casual framing, slightly imperfect crop. Micro motion blur allowed. No HDR look. Flat image colors.`,
    `Subject behavior: Neutral expression or as described. Relaxed posture. Arms not posed. This image must look like a casual iPhone video frame or paused reel, NOT a professional photo.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Main swipe function
// ---------------------------------------------------------------------------

export async function swipeCompetitorVideo(
  input: VideoSwipeInput
): Promise<VideoSwipeResult> {
  const db = createServerSupabase();
  const {
    workspaceId,
    productSlug,
    competitorVideoUrl,
    competitorAdCopy,
    brandName,
    videoDuration,
    notifyTelegram,
    existingJobId,
  } = input;

  // Progress updater for live UI
  async function updateProgress(jobId: string, step: string, message: string) {
    await db
      .from("video_jobs")
      .update({
        swipe_progress: { step, message },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "analyzing",
      "Gemini is watching the competitor video..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 1: Gemini watches the actual video
  // -----------------------------------------------------------------------
  const geminiPrompt = buildVideoSwipeGeminiPrompt();
  const geminiResult = await callGeminiVideo(
    competitorVideoUrl,
    geminiPrompt.system,
    geminiPrompt.user
  );

  const rawGemini = geminiResult.text.trim();
  if (!rawGemini) throw new Error("Gemini returned empty response");

  let analysis: {
    transcript: string;
    hook_first_3_seconds: string;
    big_idea: string;
    hook_type: string;
    format_type: string;
    delivery_style: string;
    script_structure: string;
    character_description: string;
    setting: string;
    implied_device: string;
    camera_setup: string;
    lighting_analysis: string;
    visual_style: string;
    audio_environment: string;
    product_interaction: string;
    persuasion_analysis: string;
    why_it_works: string;
    duration_seconds: number;
    scene_count: number;
    has_text_overlays: boolean;
    has_music: boolean;
    language: string;
  };

  try {
    const cleaned = rawGemini
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    analysis = JSON.parse(cleaned);
  } catch {
    console.error(
      "[swipe-video] Failed to parse Gemini response:",
      rawGemini.slice(0, 500)
    );
    throw new Error("Failed to parse Gemini video analysis");
  }

  // Log Gemini usage
  await db.from("usage_logs").insert({
    type: "video_swipe_analysis",
    model: "gemini-2.5-pro",
    input_tokens: geminiResult.usage.promptTokens,
    output_tokens: geminiResult.usage.completionTokens,
    cost_usd: 0,
    metadata: {
      purpose: "competitor_video_swipe",
      video_url: competitorVideoUrl.slice(0, 200),
      duration: videoDuration,
      total_tokens: geminiResult.usage.totalTokens,
    },
  });

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "generating_concept",
      "Claude is creating an adapted video concept..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 2: Claude generates adapted concept
  // -----------------------------------------------------------------------
  const context = await loadVideoUgcContext(productSlug, workspaceId);
  const systemPrompt = buildVideoUgcSystemPrompt(
    productSlug,
    context.productBrief,
    context.guidelines,
    context.hookInspiration,
    context.learningsContext,
    context.existingCharacters,
    "multi_clip",
    { enabled: false }
  );

  const userPrompt = `A competitor video ad was analyzed by watching the actual video with AI:

## COMPETITOR VIDEO ANALYSIS

**TRANSCRIPT** (word-for-word with emotional annotations):
"${analysis.transcript || "(no spoken dialogue)"}"

**HOOK (first 3 seconds)**: ${analysis.hook_first_3_seconds || "N/A"}
**BIG IDEA**: ${analysis.big_idea || "N/A"}
**FORMAT**: ${analysis.format_type} | **HOOK TYPE**: ${analysis.hook_type} | **DELIVERY**: ${analysis.delivery_style}
**SCRIPT STRUCTURE**: ${analysis.script_structure}
**CHARACTER**: ${analysis.character_description}
**SETTING**: ${analysis.setting}
**CAMERA**: ${analysis.camera_setup} | **DEVICE**: ${analysis.implied_device || "iPhone"}
**LIGHTING**: ${analysis.lighting_analysis || "N/A"}
**AUDIO**: ${analysis.audio_environment || "N/A"}
**PRODUCT INTERACTION**: ${analysis.product_interaction || "N/A"}
**DURATION**: ~${analysis.duration_seconds || videoDuration || 15}s

**WHY IT WORKS**: ${analysis.why_it_works || analysis.persuasion_analysis}
**PERSUASION ANALYSIS**: ${analysis.persuasion_analysis}

${competitorAdCopy ? `**COMPETITOR AD COPY**: ${competitorAdCopy.slice(0, 1500)}` : ""}

## YOUR TASK

Create 1 adapted UGC video concept for our product that SWIPES the FORMAT and APPROACH from this competitor ad. Do NOT copy the messaging or script — adapt the STRUCTURE, HOOK TYPE, and DELIVERY STYLE for our product.

## UGC AUTHENTICITY RULES FOR SHOT DESCRIPTIONS

Your shot descriptions and VEO prompts MUST follow these rules for authentic UGC:
1. **iPhone aesthetics**: Specify iPhone front-camera, ~24mm equivalent, HDR auto-tone
2. **Imperfect framing**: Off-center composition, slightly cropped forehead, handheld sway
3. **Natural lighting only**: Window light, bathroom vanity, car daylight — NEVER studio lighting
4. **Authentic environments**: Messy bedrooms, parked cars, bathrooms — lived-in details
5. **Hand safety**: Keep hands below collarbone, no gestures near lens or face, no pointing
6. **Real skin**: Visible pores, no smoothing, no beauty filters, natural shadows
7. **Conversational delivery**: Filler words, natural pauses, direct eye contact, real person cadence

Each shot's veo_prompt should be a detailed ~300 character Sora 2/VEO-optimized prompt including character description, setting, camera angle, lighting, and specific actions.

${context.existingConcepts.length > 0 ? `### EXISTING CONCEPTS (do NOT duplicate)\n${context.existingConcepts.map((c) => `- ${c}`).join("\n")}` : ""}

Generate exactly 1 concept with 3-5 shots (each 8 seconds).
Return ONLY valid JSON. No markdown fences.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0.7,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawClaude =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";
  if (!rawClaude) throw new Error("Claude returned empty response");

  // Parse proposal
  let proposal: {
    concept_name: string;
    format_type: string;
    hook_type: string;
    script_structure: string;
    delivery_style: string;
    script: string;
    character_description: string;
    product_description?: string;
    shots: Array<{
      shot_number: number;
      shot_description: string;
      veo_prompt: string;
      duration_seconds: number;
    }>;
    ad_copy_primary: string;
    ad_copy_headline: string;
    awareness_level?: string;
  };

  try {
    let cleaned = rawClaude
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

    const parsed = JSON.parse(cleaned);
    // Handle both { proposals: [...] } and direct object
    proposal = parsed.proposals ? parsed.proposals[0] : parsed;
  } catch {
    console.error(
      "[swipe-video] Failed to parse Claude response:",
      rawClaude.slice(0, 500)
    );
    throw new Error("Failed to parse Claude concept response");
  }

  if (!proposal?.concept_name || !proposal?.shots?.length) {
    throw new Error("Claude response missing concept_name or shots");
  }

  // Log Claude usage
  await db.from("usage_logs").insert({
    type: "claude_rewrite",
    model: CLAUDE_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: 0,
    metadata: {
      purpose: "competitor_video_swipe_concept",
      video_job_id: existingJobId,
      brand: brandName,
    },
  });

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "creating",
      "Creating video concept..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 3: Create video_job + shots
  // -----------------------------------------------------------------------
  const { data: lastJob } = await db
    .from("video_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .single();

  const nextConceptNumber = ((lastJob?.concept_number as number) ?? 0) + 1;

  let videoJobId: string;

  if (existingJobId) {
    await db
      .from("video_jobs")
      .update({
        concept_name: proposal.concept_name,
        concept_number: nextConceptNumber,
        hook_type: proposal.hook_type || null,
        script_structure: proposal.script_structure || null,
        format_type: proposal.format_type || null,
        delivery_style: proposal.delivery_style || null,
        script: proposal.script || null,
        character_description: proposal.character_description || null,
        product_description: proposal.product_description || null,
        ad_copy_primary: Array.isArray(proposal.ad_copy_primary)
          ? proposal.ad_copy_primary
          : [proposal.ad_copy_primary],
        ad_copy_headline: Array.isArray(proposal.ad_copy_headline)
          ? proposal.ad_copy_headline
          : [proposal.ad_copy_headline],
        awareness_level: proposal.awareness_level || null,
        status: "draft",
        swipe_progress: {
          step: "generating_images",
          message: "Generating shot keyframes...",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJobId);
    videoJobId = existingJobId;
  } else {
    const { data: newJob, error: jobErr } = await db
      .from("video_jobs")
      .insert({
        workspace_id: workspaceId,
        product: productSlug,
        concept_name: proposal.concept_name,
        concept_number: nextConceptNumber,
        hook_type: proposal.hook_type || null,
        script_structure: proposal.script_structure || null,
        format_type: proposal.format_type || null,
        delivery_style: proposal.delivery_style || null,
        script: proposal.script || null,
        character_description: proposal.character_description || null,
        product_description: proposal.product_description || null,
        ad_copy_primary: Array.isArray(proposal.ad_copy_primary)
          ? proposal.ad_copy_primary
          : [proposal.ad_copy_primary],
        ad_copy_headline: Array.isArray(proposal.ad_copy_headline)
          ? proposal.ad_copy_headline
          : [proposal.ad_copy_headline],
        awareness_level: proposal.awareness_level || null,
        status: "draft",
        source: "autopilot",
        pipeline_mode: "multi_clip",
        max_shots: proposal.shots.length,
        reuse_first_frame: true,
        target_languages: ["sv", "da", "no"],
      })
      .select("id")
      .single();

    if (jobErr || !newJob)
      throw new Error(`Failed to create video_job: ${jobErr?.message}`);
    videoJobId = newJob.id;
  }

  // Insert shots
  const shotRows = proposal.shots.map((shot) => ({
    video_job_id: videoJobId,
    shot_number: shot.shot_number,
    shot_description: shot.shot_description,
    veo_prompt: shot.veo_prompt,
    video_duration_seconds: shot.duration_seconds ?? 8,
    image_status: "pending",
  }));

  const { error: shotsErr } = await db.from("video_shots").insert(shotRows);
  if (shotsErr) {
    console.error("[swipe-video] Failed to insert shots:", shotsErr);
  }

  // Auto-assign landing page
  const landingPageId = await findBestLandingPage(
    db,
    workspaceId,
    productSlug
  );
  if (landingPageId) {
    await db
      .from("video_jobs")
      .update({ landing_page_id: landingPageId })
      .eq("id", videoJobId);
  }

  // -----------------------------------------------------------------------
  // Step 4: Auto-generate shot keyframe images (reuse_first_frame mode)
  // -----------------------------------------------------------------------
  let shotImagesGenerated = 0;

  try {
    // Get the shots we just inserted
    const { data: shots } = await db
      .from("video_shots")
      .select("id, shot_number, shot_description")
      .eq("video_job_id", videoJobId)
      .order("shot_number");

    if (shots && shots.length > 0) {
      const firstShot = shots[0];
      const imagePrompt = buildImagePrompt(
        firstShot.shot_description,
        proposal.character_description,
        proposal.product_description ?? null
      );

      // Generate keyframe for shot 1
      const taskId = await createImageTask(imagePrompt, [], "2:3", "1K");

      await db
        .from("video_shots")
        .update({ image_kie_task_id: taskId, image_status: "generating" })
        .eq("id", firstShot.id);

      // Mark remaining shots as generating (they'll reuse shot 1)
      for (const shot of shots.slice(1)) {
        await db
          .from("video_shots")
          .update({
            image_kie_task_id: `reuse:${firstShot.id}`,
            image_status: "generating",
          })
          .eq("id", shot.id);
      }

      // Poll for completion
      const result = await pollTaskResult(taskId);

      if (result.urls.length > 0) {
        const imageUrl = result.urls[0];

        // Download and upload to Supabase storage
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const filePath = `video-shots/${videoJobId}/shot-1.png`;

          const { error: uploadErr } = await db.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, buffer, {
              contentType: "image/png",
              upsert: true,
            });

          if (!uploadErr) {
            const { data: urlData } = db.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl;

            // Update all shots with the same image (reuse_first_frame)
            for (const shot of shots) {
              await db
                .from("video_shots")
                .update({
                  image_url: publicUrl,
                  image_status: "completed",
                })
                .eq("id", shot.id);
            }

            shotImagesGenerated = shots.length;
          }
        }
      }
    }
  } catch (err) {
    console.error("[swipe-video] Keyframe generation failed:", err);
    // Non-fatal — concept is still created
  }

  // Update job status
  await db
    .from("video_jobs")
    .update({
      status: "generated",
      swipe_progress: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoJobId);

  // -----------------------------------------------------------------------
  // Step 5: Telegram notification
  // -----------------------------------------------------------------------
  if (notifyTelegram) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const hubUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://content-hub-nine-theta.vercel.app";

      const caption = [
        `🎬 Video Swipe #${nextConceptNumber}:`,
        ``,
        `"${proposal.concept_name}"`,
        `From: ${brandName}`,
        `Format: ${proposal.format_type} | Hook: ${proposal.hook_type}`,
        `Shots: ${proposal.shots.length} | Images: ${shotImagesGenerated}/${proposal.shots.length}`,
        ``,
        `${hubUrl}/video-ads/${videoJobId}`,
      ].join("\n");

      const buttons = [
        [
          {
            text: "\u2705 Approve",
            callback_data: `video_approve:${videoJobId}`,
          },
          {
            text: "\u274c Reject",
            callback_data: `video_reject:${videoJobId}`,
          },
        ],
      ];

      // Try to send with keyframe image, fall back to text
      try {
        const { data: firstShot } = await db
          .from("video_shots")
          .select("image_url")
          .eq("video_job_id", videoJobId)
          .eq("shot_number", 1)
          .single();

        if (firstShot?.image_url) {
          await sendPhoto(chatId, firstShot.image_url, caption, buttons);
        } else {
          await sendMessageWithInlineKeyboard(chatId, caption, buttons);
        }
      } catch {
        await sendMessageWithInlineKeyboard(chatId, caption, buttons);
      }
    }
  }

  return {
    videoJobId,
    conceptName: proposal.concept_name,
    shotsCreated: proposal.shots.length,
    shotImagesGenerated,
  };
}
