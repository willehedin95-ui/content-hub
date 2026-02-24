import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { stripForTranslation, restoreAfterTranslation, compactForSwiper, decompactAfterSwiper } from "@/lib/html-parser";
import { buildRewritePrompts, createRewriteStream } from "@/lib/claude";
import type { SwiperAngle } from "@/lib/claude";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";
import { CLAUDE_MODEL } from "@/lib/constants";

export const maxDuration = 300;

/**
 * POST /api/swipe
 * Orchestrates the page swipe with SSE streaming:
 *   1. Loads product data
 *   2. Compacts HTML
 *   3. Streams Claude rewrite (sends progress events)
 *   4. Decompacts + restores
 *   5. Sends final result
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { html, productId, sourceUrl, sourceLanguage, angle } = body;

  if (!html || !productId) {
    return NextResponse.json(
      { error: "html and productId are required" },
      { status: 400 }
    );
  }

  if (!isValidUUID(productId)) {
    return NextResponse.json(
      { error: "Invalid product ID" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Load product bank data
  const [productResult, guidelinesResult, referencesResult] = await Promise.all([
    db.from("products").select("*").eq("id", productId).single(),
    db
      .from("copywriting_guidelines")
      .select("*")
      .or(`product_id.eq.${productId},product_id.is.null`)
      .order("sort_order", { ascending: true }),
    db
      .from("reference_pages")
      .select("*")
      .or(`product_id.eq.${productId},product_id.is.null`)
      .order("created_at", { ascending: false }),
  ]);

  if (productResult.error || !productResult.data) {
    return NextResponse.json(
      { error: "Product not found" },
      { status: 404 }
    );
  }

  const product = productResult.data as ProductFull;
  const guidelines = (guidelinesResult.data ?? []) as CopywritingGuideline[];
  const references = (referencesResult.data ?? []) as ReferencePage[];

  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;
  const swiperAngle = (angle as SwiperAngle) || undefined;

  // Strip non-translatable elements from HTML
  const { bodyHtml, headHtml, stripped } = stripForTranslation(html);

  // Compact class/style/data attributes to reduce token count
  const { compact, classMap, styleMap } = compactForSwiper(bodyHtml);

  // Build prompts
  const { systemPrompt, userPrompt } = buildRewritePrompts(
    compact,
    product,
    guidelines,
    references,
    sourceLanguage || "en",
    swiperAngle,
    productBrief
  );

  // Return SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        send("progress", { step: "rewriting", message: "Sending to Claude..." });

        // Stream Claude's response
        const claudeStream = createRewriteStream(systemPrompt, userPrompt, apiKey);
        let outputChars = 0;
        let lastProgressAt = 0;

        claudeStream.on("text", (text) => {
          outputChars += text.length;
          // Send progress every ~2000 chars to avoid flooding
          if (outputChars - lastProgressAt >= 2000) {
            lastProgressAt = outputChars;
            send("progress", {
              step: "rewriting",
              message: `Claude writing... (${Math.round(outputChars / 1000)}k chars)`,
              chars: outputChars,
            });
          }
        });

        const response = await claudeStream.finalMessage();
        const rewrittenCompact =
          response.content[0].type === "text" ? response.content[0].text : "";
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;

        send("progress", { step: "restoring", message: "Restoring HTML..." });

        // Restore compacted attributes, then restore stripped elements + head
        const rewrittenBody = decompactAfterSwiper(rewrittenCompact, classMap, styleMap);
        const rewrittenHtml = restoreAfterTranslation(
          rewrittenBody,
          headHtml,
          stripped,
          {}
        );

        // Log usage (fire and forget)
        db.from("usage_logs").insert({
          type: "claude_rewrite",
          model: CLAUDE_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: (inputTokens * 3 + outputTokens * 15) / 1_000_000,
          metadata: {
            product_id: productId,
            product_name: product.name,
            source_url: sourceUrl,
            angle: swiperAngle || "none",
            has_product_brief: !!productBrief,
            guidelines_count: guidelines.length,
            references_count: references.length,
          },
        }).then(() => {});

        // Extract images from the page for the image mapper
        const imageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
        const images: { src: string; alt: string }[] = [];
        let match;
        while ((match = imageRegex.exec(rewrittenHtml)) !== null) {
          const src = match[1];
          if (src && !src.startsWith("data:")) {
            images.push({ src, alt: match[2] || "" });
          }
        }

        send("done", {
          rewrittenHtml,
          originalHtml: html,
          images,
          usage: { inputTokens, outputTokens },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Rewrite failed";
        console.error("[Swipe Error]", message);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
