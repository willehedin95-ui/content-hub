import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { stripForTranslation, restoreAfterTranslation, compactForSwiper, decompactAfterSwiper } from "@/lib/html-parser";
import { rewritePageForProduct } from "@/lib/claude";
import type { SwiperAngle } from "@/lib/claude";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";

export const maxDuration = 300;

/**
 * POST /api/swipe
 * Orchestrates the page swipe: takes fetched HTML + product ID,
 * loads product bank data, sends to Claude for rewriting, returns result.
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
    return safeError(productResult.error, "Product not found", 404);
  }

  const product = productResult.data as ProductFull;
  const guidelines = (guidelinesResult.data ?? []) as CopywritingGuideline[];
  const references = (referencesResult.data ?? []) as ReferencePage[];

  // Look for the product brief in guidelines
  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;
  const swiperAngle = (angle as SwiperAngle) || undefined;

  // Strip non-translatable elements from HTML
  const { bodyHtml, headHtml, stripped } = stripForTranslation(html);

  // Compact class/style/data attributes to reduce token count
  // (a Tailwind page can go from 200K→30K tokens with this)
  const { compact, classMap, styleMap } = compactForSwiper(bodyHtml);

  try {
    // Send compacted HTML to Claude for rewriting
    const { result: rewrittenCompact, inputTokens, outputTokens } =
      await rewritePageForProduct(
        compact,
        product,
        guidelines,
        references,
        apiKey,
        sourceLanguage || "en",
        swiperAngle,
        productBrief
      );

    // Restore compacted attributes, then restore stripped elements + head
    const rewrittenBody = decompactAfterSwiper(rewrittenCompact, classMap, styleMap);
    const rewrittenHtml = restoreAfterTranslation(
      rewrittenBody,
      headHtml,
      stripped,
      {} // No meta translations in swipe — handled by the rewrite itself
    );

    // Log usage
    await db.from("usage_logs").insert({
      type: "claude_rewrite",
      model: "claude-sonnet-4-5-20250929",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: (inputTokens * 3 + outputTokens * 15) / 1_000_000, // Sonnet pricing
      metadata: {
        product_id: productId,
        product_name: product.name,
        source_url: sourceUrl,
        angle: swiperAngle || "none",
        has_product_brief: !!productBrief,
        guidelines_count: guidelines.length,
        references_count: references.length,
      },
    });

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

    return NextResponse.json({
      rewrittenHtml,
      originalHtml: html,
      images,
      usage: { inputTokens, outputTokens },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rewrite failed";
    console.error("[Swipe Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
