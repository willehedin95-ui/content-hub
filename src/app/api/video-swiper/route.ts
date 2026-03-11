import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, pollTaskResult, createVeoTask, createKlingTask, callGeminiVideo } from "@/lib/kie";
import {
  buildVideoSwiperSystemPrompt,
  buildVideoSwiperUserPrompt,
} from "@/lib/video-swiper-prompt";
import type { ProductFull } from "@/types";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SceneExtraction extends Record<string, any> {
  scene?: Record<string, unknown>;
  composition?: Record<string, unknown>;
  subjects?: Array<{ is_competitor_product?: boolean; description?: string; type?: string; [k: string]: unknown }>;
  colors?: Record<string, unknown>;
  style?: Record<string, unknown>;
}

interface SceneItem {
  scene_number: number;
  time_range: string;
  duration_seconds: number;
  motion_prompt: string;
  extraction: SceneExtraction;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    video_url: videoUrl,
    video_duration: videoDuration,
    product: productSlug,
    aspect_ratio: clientAspectRatio,
    video_model: videoModel,
    notes,
  } = body as {
    video_url?: string;
    video_duration?: number;
    product?: string;
    aspect_ratio?: string;
    video_model?: "veo3" | "veo3_fast" | "kling";
    notes?: string;
  };

  if (!videoUrl) {
    return NextResponse.json({ error: "video_url is required" }, { status: 400 });
  }
  if (!videoDuration || videoDuration <= 0) {
    return NextResponse.json({ error: "video_duration is required" }, { status: 400 });
  }

  // Fetch product data (only when product is selected)
  const db = createServerSupabase();

  let product: ProductFull | null = null;
  let productHeroUrls: string[] = [];

  if (productSlug) {
    const { data: productData, error: productErr } = await db
      .from("products")
      .select("*")
      .eq("slug", productSlug)
      .single();

    if (productErr || !productData) {
      return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
    }
    product = productData as ProductFull;

    // Fetch product hero images for Nano Banana reference
    const { data: productImages } = await db
      .from("product_images")
      .select("url")
      .eq("product_id", product.id)
      .eq("category", "hero")
      .order("sort_order", { ascending: true });

    productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);
  }

  // Build prompts
  const systemPrompt = buildVideoSwiperSystemPrompt();
  const userPrompt = buildVideoSwiperUserPrompt(videoDuration, notes);

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      // --- Step 1: Gemini video analysis ---
      await emit({ step: "analyzing", message: "Analyzing video with Gemini..." });

      const geminiResult = await callGeminiVideo(videoUrl, systemPrompt, userPrompt);
      const rawContent = geminiResult.text.trim();

      if (!rawContent) {
        console.error("[video-swiper] Gemini returned empty content. Usage:", JSON.stringify(geminiResult.usage));
        await emit({ step: "error", message: "No response from Gemini — the video may be too large or in an unsupported format. Try a shorter clip." });
        return;
      }

      // Parse JSON (strip markdown fences if present)
      let parsed: {
        analysis: { video_type: string; total_duration_seconds: number; scene_count: number; description: string };
        scenes: SceneItem[];
      };
      try {
        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[video-swiper] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
        await emit({ step: "error", message: `Failed to parse Gemini response: ${msg}` });
        return;
      }

      if (!parsed.analysis || !parsed.scenes?.length) {
        await emit({ step: "error", message: "Gemini response missing required fields (analysis, scenes)" });
        return;
      }

      // Log Gemini usage
      await db.from("usage_logs").insert({
        type: "video_swiper",
        model: "gemini-2.5-pro",
        input_tokens: geminiResult.usage.promptTokens,
        output_tokens: geminiResult.usage.completionTokens,
        cost_usd: 0, // Kie credits, not direct cost
        metadata: {
          product: productSlug || null,
          video_duration: videoDuration,
          scene_count: parsed.scenes.length,
          total_tokens: geminiResult.usage.totalTokens,
        },
      });

      await emit({
        step: "analyzed",
        message: `Analysis complete — ${parsed.scenes.length} scene${parsed.scenes.length > 1 ? "s" : ""} identified`,
        analysis: parsed.analysis,
        scene_count: parsed.scenes.length,
      });

      // --- Step 2: Generate keyframes with Nano Banana (image swiper pattern) ---
      await emit({
        step: "generating_keyframes",
        message: `Generating keyframe${parsed.scenes.length > 1 ? "s" : ""} with Nano Banana...`,
      });

      const keyframeResults: Array<{
        scene_number: number;
        keyframe_url: string | null;
        error: string | null;
      }> = [];

      for (const scene of parsed.scenes) {
        try {
          await emit({
            step: "keyframe_generating",
            message: `Generating keyframe for Scene ${scene.scene_number}...`,
            scene_number: scene.scene_number,
          });

          // Clone extraction and swap competitor product (same as image swiper)
          const nanaBananaJson = structuredClone(scene.extraction);
          if (nanaBananaJson.subjects && Array.isArray(nanaBananaJson.subjects)) {
            for (const subject of nanaBananaJson.subjects) {
              if (subject.is_competitor_product && product) {
                subject.description = `${product.name} pillow — ${product.description || "premium ergonomic pillow"}`;
                subject.type = "product";
                delete subject.is_competitor_product;
              } else if (subject.is_competitor_product) {
                subject.description = "Generic ergonomic wellness product, neutral/white color";
                delete subject.is_competitor_product;
              }
            }
          }

          // Add generation instruction
          nanaBananaJson.task = "generate_image";
          let instruction = product
            ? `Recreate this visual style featuring ${product.name}. The product must match the reference images provided.`
            : "Recreate this visual style with the described subjects and environment.";
          if (notes) {
            instruction += ` Additional instructions: ${notes}`;
          }
          nanaBananaJson.instruction = instruction;

          const nanaBananaPrompt = JSON.stringify(nanaBananaJson);

          // Use client-provided aspect ratio (from actual video dimensions), fall back to extraction
          const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
          const detectedRatio = (clientAspectRatio && validRatios.includes(clientAspectRatio))
            ? clientAspectRatio
            : (() => {
                const rawRatio = String(scene.extraction.composition?.aspect_ratio ?? "").trim();
                return validRatios.includes(rawRatio) ? rawRatio : "16:9";
              })();

          const imageTaskId = await createImageTask(
            nanaBananaPrompt,
            productHeroUrls,
            detectedRatio,
            "1K"
          );

          // Poll until keyframe is ready (typically 10-30s)
          const result = await pollTaskResult(imageTaskId);

          if (result.urls.length > 0) {
            keyframeResults.push({
              scene_number: scene.scene_number,
              keyframe_url: result.urls[0],
              error: null,
            });

            await emit({
              step: "keyframe_completed",
              message: `Keyframe for Scene ${scene.scene_number} ready`,
              scene_number: scene.scene_number,
              keyframe_url: result.urls[0],
            });
          } else {
            keyframeResults.push({
              scene_number: scene.scene_number,
              keyframe_url: null,
              error: "No image URL returned",
            });
          }

          // Log Nano Banana usage
          await db.from("usage_logs").insert({
            type: "video_swiper_keyframe",
            model: "nano-banana-2",
            cost_usd: 0,
            metadata: {
              product: productSlug || null,
              scene_number: scene.scene_number,
              task_id: imageTaskId,
              has_product_ref: productHeroUrls.length > 0,
              aspect_ratio: detectedRatio,
            },
          });

          // Brief delay between API calls
          if (parsed.scenes.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[video-swiper] Keyframe generation failed for scene ${scene.scene_number}:`, msg);
          keyframeResults.push({
            scene_number: scene.scene_number,
            keyframe_url: null,
            error: msg,
          });
          await emit({
            step: "keyframe_error",
            message: `Keyframe for Scene ${scene.scene_number} failed: ${msg}`,
            scene_number: scene.scene_number,
          });
        }
      }

      // --- Step 3: Kick off video generation with keyframes as start frames ---
      const selectedModel = videoModel || "veo3";
      const modelLabel = selectedModel === "kling" ? "Kling 3.0" : selectedModel === "veo3_fast" ? "Veo 3 Fast" : "Veo 3";
      await emit({ step: "generating", message: `Starting ${modelLabel} video generation...` });

      // Aspect ratio mapping
      const isPortrait = clientAspectRatio === "9:16" || clientAspectRatio === "4:5";
      const veoAspectRatio: "9:16" | "16:9" = isPortrait ? "9:16" : "16:9";
      const klingAspectRatio = clientAspectRatio || "16:9";

      const tasks: Array<{
        scene_number: number;
        description: string;
        task_id: string;
        motion_prompt: string;
        keyframe_url: string | null;
        duration_seconds: number;
      }> = [];

      for (const scene of parsed.scenes) {
        const keyframe = keyframeResults.find((k) => k.scene_number === scene.scene_number);
        const keyframeUrl = keyframe?.keyframe_url ?? null;

        try {
          let taskId: string;

          if (selectedModel === "kling") {
            taskId = await createKlingTask({
              prompt: scene.motion_prompt,
              ...(keyframeUrl && { imageUrls: [keyframeUrl] }),
              aspectRatio: klingAspectRatio,
              duration: Math.min(scene.duration_seconds || 10, 15),
              sound: true,
            });
          } else {
            taskId = await createVeoTask(scene.motion_prompt, {
              model: selectedModel === "veo3_fast" ? "veo3_fast" : "veo3",
              aspect_ratio: veoAspectRatio,
              ...(keyframeUrl && {
                generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO" as const,
                imageUrls: [keyframeUrl],
              }),
            });
          }

          tasks.push({
            scene_number: scene.scene_number,
            description: `${scene.time_range} — ${scene.motion_prompt.slice(0, 100)}`,
            task_id: taskId,
            motion_prompt: scene.motion_prompt,
            keyframe_url: keyframeUrl,
            duration_seconds: scene.duration_seconds,
          });

          await emit({
            step: "task_started",
            message: `Scene ${scene.scene_number} video generation started${keyframeUrl ? " (with keyframe)" : ""}`,
            scene_number: scene.scene_number,
            task_id: taskId,
          });

          // Log usage
          await db.from("usage_logs").insert({
            type: selectedModel === "kling" ? "video_swiper_kling" : "video_swiper_veo",
            model: selectedModel === "kling" ? "kling-3.0" : selectedModel,
            cost_usd: 0,
            metadata: {
              product: productSlug || null,
              scene_number: scene.scene_number,
              task_id: taskId,
              has_keyframe: !!keyframeUrl,
              aspect_ratio: selectedModel === "kling" ? klingAspectRatio : veoAspectRatio,
            },
          });

          // Brief delay between API calls
          if (parsed.scenes.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await emit({
            step: "task_error",
            message: `Failed to start Scene ${scene.scene_number}: ${msg}`,
            scene_number: scene.scene_number,
          });
        }
      }

      if (tasks.length === 0) {
        await emit({ step: "error", message: `Failed to start any ${modelLabel} generation tasks` });
        return;
      }

      await emit({
        step: "generating_started",
        message: `${tasks.length} video${tasks.length > 1 ? " clips" : ""} generating — this takes 2-4 minutes`,
        tasks,
        analysis: parsed.analysis,
        total_tokens: geminiResult.usage.totalTokens,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[video-swiper] Error:", msg);
      await emit({ step: "error", message: `Analysis failed: ${msg}` });
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
