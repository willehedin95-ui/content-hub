/**
 * Blog image generation — auto-generates native-style editorial images
 * for blog articles using Claude Haiku (prompt generation) + Kie AI (image generation).
 *
 * Flow: find placeholder <img> tags → Haiku generates Nano Banana prompts →
 * Kie AI generates images → upload to Supabase → return URL mapping.
 */

import Anthropic from "@anthropic-ai/sdk";
import { generateImage } from "@/lib/kie";
import { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaceholderImage {
  index: number;
  originalUrl: string;
  cssClass: string;
  altText: string;
  sectionHeading: string;
}

interface ImagePrompt {
  index: number;
  prompt: string;
  style: string;
}

export interface GenerateBlogImagesOptions {
  articleTitle: string;
  primaryKeyword: string;
  contentBrief: string;
  category: string;
  articleHtml: string;
  slug: string;
}

export interface BlogImageResult {
  urlMap: Record<string, string>;
  generated: number;
  failed: number;
  costUsd: number;
}

type BlogImageStyle = "native-messy" | "native-closeup";

// ---------------------------------------------------------------------------
// Style selection — alternate between native-messy and native-closeup
// These produce realistic phone-photo style images (not stock photos)
// ---------------------------------------------------------------------------

function selectBlogStyle(_category: string, imageIndex: number): BlogImageStyle {
  // Alternate between the two native styles for variety
  return imageIndex % 2 === 0 ? "native-messy" : "native-closeup";
}

// ---------------------------------------------------------------------------
// Find placeholder images in article HTML
// ---------------------------------------------------------------------------

export function findPlaceholderImages(html: string): PlaceholderImage[] {
  const results: PlaceholderImage[] = [];
  const imgRegex = /<img[^>]+src="(https:\/\/placehold\.co\/[^"]+)"[^>]*>/gi;
  let match;
  let index = 0;

  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const originalUrl = match[1];

    // Extract CSS class
    const classMatch = fullTag.match(/class="([^"]*)"/i);
    const cssClass = classMatch?.[1] || "";

    // Extract alt text
    const altMatch = fullTag.match(/alt="([^"]*)"/i);
    const altText = altMatch?.[1] || "";

    // Find nearest heading before this image position
    const beforeImage = html.slice(0, match.index);
    const headingMatch = beforeImage.match(/<h[23][^>]*>([^<]+)<\/h[23]>/gi);
    const sectionHeading = headingMatch
      ? headingMatch[headingMatch.length - 1].replace(/<[^>]*>/g, "").trim()
      : "";

    results.push({ index, originalUrl, cssClass, altText, sectionHeading });
    index++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Claude Haiku — generate Nano Banana prompts
// ---------------------------------------------------------------------------

const HAIKU_SYSTEM_PROMPT = `You generate image prompts for Nano Banana Pro (an AI image generator) to create REALISTIC phone-style images for a Swedish health & wellness blog. Images must look like someone took them with their iPhone — NOT stock photos, NOT polished studio shots.

The image MUST be directly relevant to the section it appears in. Read the section heading and alt text carefully.

Two styles:

1. native-messy: iPhone snapshot aesthetic. Slightly messy real-life scenes — a bedroom with rumpled sheets and a pillow half-off the bed, a nightstand with a water glass and phone, someone's hand adjusting a pillow on a messy bed. Shot on iPhone 15, slightly off-center composition, natural room lighting (not perfect). Warm yellowish indoor light or blue morning window light. Slight motion blur on edges. Real life, not staged. Think "photo someone texted you" not "magazine shoot."

2. native-closeup: Close-up phone photo with shallow depth of field. A pillow's memory foam texture with a thumb pressing into it, the tag on a pillow showing the brand, the zipper detail on a pillow cover, someone's neck/shoulder from behind resting on a pillow. iPhone portrait mode bokeh. Natural window light from one side. Slightly warm white balance. Imperfect framing — subject slightly off-center.

TOPIC-SPECIFIC RULES:
- For PILLOW articles: Show actual SLEEPING pillows — ergonomic shapes, memory foam contours, cervical support curves. NEVER show decorative throw pillows, couch cushions, or accent pillows. These are functional sleep pillows on beds.
- For SLEEP articles: Real bedrooms, actual sleeping situations, alarm clocks, morning light
- For COLLAGEN articles: Liquid supplement bottles on a bathroom counter, someone holding a supplement glass, kitchen counter morning routines
- For HAIR/SKIN articles: Natural close-ups of skin texture, hair texture, bathroom mirrors

CRITICAL — NEVER generate:
- Decorative throw pillows or couch cushions (these are NOT sleep pillows)
- Medical/clinical imagery (no anatomy, blood, wounds)
- Generic stock photo compositions (no posed smiling people)
- Overly polished or studio-lit scenes
- Perfect symmetrical compositions

RULES:
- Prompts must be 80-120 words with specific visual detail
- Always specify "shot on iPhone" or "phone camera" aesthetic
- Include 1 imperfection per prompt (slightly crooked angle, edge of frame cut off, shadow from photographer's hand, etc.)
- Muted, slightly warm color palette — real indoor lighting
- NEVER use: "photorealistic", "cinematic", "vibrant", "beautiful", "stunning", "professional"
- All images are 16:9 LANDSCAPE format — compose horizontally
- No text overlays, no brand names, no logos
- Each image must illustrate a DIFFERENT aspect of the article
- End each prompt with: "iPhone photo, candid, natural light."

Output ONLY a JSON array, no markdown fences:
[{"index": 0, "prompt": "...", "style": "native-messy"}]`;

async function generateImagePrompts(
  placeholders: PlaceholderImage[],
  articleTitle: string,
  primaryKeyword: string,
  category: string,
  contentBrief: string
): Promise<{ prompts: ImagePrompt[]; cost: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const imageDescriptions = placeholders.map((p) => {
    const style = selectBlogStyle(category, p.index);
    const role = p.cssClass.includes("hero") ? "HERO" : "SECTION";
    return `Image ${p.index} (${role}, style: ${style}):
Section: "${p.sectionHeading || articleTitle}"
Alt text hint: "${p.altText}"`;
  }).join("\n\n");

  const userPrompt = `Article: "${articleTitle}"
Keyword: "${primaryKeyword}"
Category: ${category}
Brief: ${contentBrief.slice(0, 400)}

Generate ${placeholders.length} image prompts:

${imageDescriptions}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: HAIKU_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text;

  // Strip markdown fences (Haiku quirk)
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const prompts: ImagePrompt[] = JSON.parse(cleaned);

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cost = (inputTokens * 1 + outputTokens * 5) / 1_000_000; // Haiku pricing

  return { prompts, cost };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function generateBlogImages(
  opts: GenerateBlogImagesOptions
): Promise<BlogImageResult> {
  const { articleTitle, primaryKeyword, contentBrief, category, articleHtml, slug } = opts;

  // Step 1: Find placeholders
  const placeholders = findPlaceholderImages(articleHtml);
  if (!placeholders.length) {
    console.log("[blog-images] No placeholder images found in article HTML");
    return { urlMap: {}, generated: 0, failed: 0, costUsd: 0 };
  }

  console.log(`[blog-images] Found ${placeholders.length} placeholder images — generating ALL via Nano Banana`);

  // Step 2: Generate prompts via Claude Haiku
  const { prompts, cost: haikuCost } = await generateImagePrompts(
    placeholders,
    articleTitle,
    primaryKeyword,
    category,
    contentBrief
  );

  console.log(`[blog-images] Generated ${prompts.length} image prompts (Haiku cost: $${haikuCost.toFixed(4)})`);

  // Step 3: Generate images in parallel via Kie AI
  const db = createServerSupabase();
  const urlMap: Record<string, string> = {};
  let generated = 0;
  let failed = 0;
  let totalImageCost = 0;

  const settled = await Promise.allSettled(
    prompts.map(async (imgPrompt) => {
      const placeholder = placeholders[imgPrompt.index];
      if (!placeholder) return;

      const label = `[blog-images] Image ${placeholder.index}`;
      console.log(`${label}: Generating (style: ${imgPrompt.style})...`);

      // Generate via Kie AI — 16:9 landscape
      const { urls: resultUrls } = await generateImage(imgPrompt.prompt, [], "16:9");

      if (!resultUrls?.length) {
        throw new Error(`${label}: No image URLs returned`);
      }

      // Download the generated image
      const imageRes = await fetch(resultUrls[0]);
      if (!imageRes.ok) {
        throw new Error(`${label}: Failed to download — ${imageRes.status}`);
      }
      const buffer = Buffer.from(await imageRes.arrayBuffer());

      // Upload to Supabase storage
      const filePath = `blog/${slug}/${placeholder.index}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: true });

      if (uploadError) {
        throw new Error(`${label}: Upload failed — ${uploadError.message}`);
      }

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      console.log(`${label}: Done → ${urlData.publicUrl.slice(0, 80)}...`);

      // Log image generation cost
      await db.from("usage_logs").insert({
        type: "blog_image",
        model: KIE_MODEL,
        cost_usd: KIE_IMAGE_COST,
        metadata: {
          slug,
          image_index: placeholder.index,
          style: imgPrompt.style,
          prompt: imgPrompt.prompt.slice(0, 200),
        },
      });

      totalImageCost += KIE_IMAGE_COST;
      urlMap[placeholder.originalUrl] = urlData.publicUrl;
    })
  );

  // Count results
  for (const result of settled) {
    if (result.status === "fulfilled") {
      generated++;
    } else {
      failed++;
      console.warn("[blog-images] Image generation failed:", result.reason);
    }
  }

  // Log Haiku prompt cost
  if (prompts.length > 0) {
    await db.from("usage_logs").insert({
      type: "blog_image_prompt",
      model: "claude-haiku",
      cost_usd: haikuCost,
      metadata: { slug, prompt_count: prompts.length },
    });
  }

  const totalCost = totalImageCost + haikuCost;
  console.log(`[blog-images] Done: ${generated} generated, ${failed} failed, cost: $${totalCost.toFixed(4)}`);

  return { urlMap, generated, failed, costUsd: totalCost };
}

// ---------------------------------------------------------------------------
// Replace placeholder URLs with real image URLs
// ---------------------------------------------------------------------------

export function replacePlaceholderImages(
  html: string,
  urlMap: Record<string, string>
): string {
  let result = html;
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    // Replace all occurrences of the placeholder URL
    while (result.includes(oldUrl)) {
      result = result.replace(oldUrl, newUrl);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inject product photo from product bank before the CTA box
// ---------------------------------------------------------------------------

export async function injectProductImage(
  html: string,
  productSlug: string
): Promise<string> {
  // Idempotent: skip if product image already exists
  if (html.includes('class="product-img"')) {
    console.log("[blog-images] Product image already exists, skipping injection");
    return html;
  }

  const db = createServerSupabase();

  // Get product ID + name
  const { data: product } = await db
    .from("products")
    .select("id, name")
    .eq("slug", productSlug)
    .single();

  if (!product) {
    console.log(`[blog-images] No product found for slug "${productSlug}", skipping product image`);
    return html;
  }

  // Get product image from assets library (category: product)
  const { data: assets } = await db
    .from("assets")
    .select("url")
    .eq("product", productSlug)
    .eq("category", "product")
    .limit(1);

  let imageUrl = assets?.[0]?.url;

  // Fallback to product_images table (hero category)
  if (!imageUrl) {
    const { data: images } = await db
      .from("product_images")
      .select("url")
      .eq("product_id", product.id)
      .eq("category", "hero")
      .limit(1);
    imageUrl = images?.[0]?.url;
  }

  if (!imageUrl) {
    console.log(`[blog-images] No product image for "${productSlug}", skipping`);
    return html;
  }

  // Insert product image before the first .cta-box
  const ctaIndex = html.indexOf('<div class="cta-box">');
  if (ctaIndex === -1) {
    console.log("[blog-images] No .cta-box found in article HTML, skipping product image");
    return html;
  }

  const productImgTag = `<img class="product-img" src="${imageUrl}" alt="${product.name}">\n    `;
  return html.slice(0, ctaIndex) + productImgTag + html.slice(ctaIndex);
}

