import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { createKlingTask } from "@/lib/kie";
import {
  buildVideoSwiperSystemPrompt,
  buildVideoSwiperUserPrompt,
} from "@/lib/video-swiper-prompt";
import type { ProductFull, CopywritingGuideline, ProductSegment } from "@/types";

export const maxDuration = 300;

interface PromptItem {
  scene_number: number;
  description: string;
  kling_prompt: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    frame_urls,
    frame_timestamps,
    video_duration,
    product: productSlug,
    notes,
  } = body as {
    frame_urls?: string[];
    frame_timestamps?: number[];
    video_duration?: number;
    product?: string;
    notes?: string;
  };

  if (!frame_urls?.length) {
    return NextResponse.json({ error: "frame_urls is required" }, { status: 400 });
  }
  if (!frame_timestamps?.length || frame_timestamps.length !== frame_urls.length) {
    return NextResponse.json({ error: "frame_timestamps must match frame_urls length" }, { status: 400 });
  }
  if (!video_duration || video_duration <= 0) {
    return NextResponse.json({ error: "video_duration is required" }, { status: 400 });
  }
  if (!productSlug) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  // Fetch product data
  const db = createServerSupabase();

  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (productErr || !product) {
    return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
  }

  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  const guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;

  const { data: segmentsData } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const segments = (segmentsData ?? []) as ProductSegment[];

  // Build prompts
  const systemPrompt = buildVideoSwiperSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines,
    segments
  );

  const userPrompt = buildVideoSwiperUserPrompt(
    frame_urls.length,
    frame_timestamps,
    video_duration,
    notes
  );

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      // --- Step 1: Claude Vision analysis ---
      await emit({ step: "analyzing", message: "Analyzing video with AI..." });

      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0.7,
        system: [
          { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: [
              ...frame_urls.map((url) => ({
                type: "image" as const,
                source: { type: "url" as const, url },
              })),
              { type: "text" as const, text: userPrompt },
            ],
          },
        ],
      });

      const rawContent =
        response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "";

      if (!rawContent) {
        await emit({ step: "error", message: "No response from AI" });
        await writer.close();
        return;
      }

      // Parse JSON
      let parsed: { analysis: Record<string, unknown>; prompt_strategy: string; prompts: PromptItem[] };
      try {
        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[video-swiper] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
        await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
        await writer.close();
        return;
      }

      if (!parsed.analysis || !parsed.prompts?.length) {
        await emit({ step: "error", message: "AI response missing required fields" });
        await writer.close();
        return;
      }

      // Log Claude usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cacheCreation =
        (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
      const cacheRead =
        (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const claudeCost = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

      await db.from("usage_logs").insert({
        type: "video_swiper",
        model: CLAUDE_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: claudeCost,
        metadata: {
          product: productSlug,
          frame_count: frame_urls.length,
          video_duration,
          prompt_strategy: parsed.prompt_strategy,
        },
      });

      await emit({
        step: "analyzed",
        message: `Analysis complete — ${parsed.prompts.length} scene${parsed.prompts.length > 1 ? "s" : ""} identified`,
        analysis: parsed.analysis,
        prompt_count: parsed.prompts.length,
      });

      // --- Step 2: Kick off Kling generation for each prompt ---
      await emit({ step: "generating", message: "Starting Kling 3.0 video generation..." });

      const tasks: Array<{ scene_number: number; description: string; task_id: string; prompt: string }> = [];

      for (const p of parsed.prompts) {
        try {
          const taskId = await createKlingTask({
            prompt: p.kling_prompt,
            sound: false,
            duration: 10,
            aspectRatio: "16:9",
            mode: "std",
          });

          tasks.push({
            scene_number: p.scene_number,
            description: p.description,
            task_id: taskId,
            prompt: p.kling_prompt,
          });

          await emit({
            step: "task_started",
            message: `Scene ${p.scene_number} generation started`,
            scene_number: p.scene_number,
            task_id: taskId,
          });

          // Log Kling usage
          await db.from("usage_logs").insert({
            type: "video_swiper_kling",
            model: "kling-3.0/video",
            cost_usd: 0,
            metadata: {
              product: productSlug,
              scene_number: p.scene_number,
              task_id: taskId,
            },
          });

          // Brief delay between API calls
          if (parsed.prompts.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await emit({
            step: "task_error",
            message: `Failed to start Scene ${p.scene_number}: ${msg}`,
            scene_number: p.scene_number,
          });
        }
      }

      if (tasks.length === 0) {
        await emit({ step: "error", message: "Failed to start any Kling generation tasks" });
        await writer.close();
        return;
      }

      await emit({
        step: "generating_started",
        message: `${tasks.length} video${tasks.length > 1 ? "s" : ""} generating — this takes 1-3 minutes`,
        tasks,
        analysis: parsed.analysis,
        prompt_strategy: parsed.prompt_strategy,
        claude_cost: Math.round(claudeCost * 10000) / 10000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[video-swiper] Error:", msg);
      await emit({ step: "error", message: `Analysis failed: ${msg}` });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
