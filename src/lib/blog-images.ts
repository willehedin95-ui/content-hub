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

type BlogImageStyle = "editorial" | "detail" | "scene";

// ---------------------------------------------------------------------------
// Category → style mapping
// ---------------------------------------------------------------------------

const CATEGORY_STYLE_MAP: Record<string, BlogImageStyle[]> = {
  "Forskning": ["scene", "detail", "editorial"],
  "Sömnproblem": ["editorial", "scene", "detail"],
  "Hudvård inifrån": ["detail", "editorial", "scene"],
  "Kollagen & Tillskott": ["detail", "scene", "editorial"],
  "Bäst i test": ["detail", "editorial", "scene"],
  "Köpguider": ["editorial", "detail", "scene"],
  "Jämförelser": ["detail", "scene", "editorial"],
  "Skötselguider": ["scene", "editorial", "detail"],
  "Sov Bättre": ["editorial", "scene", "detail"],
  "Hår & Naglar": ["detail", "editorial", "scene"],
};

const DEFAULT_STYLES: BlogImageStyle[] = ["editorial", "detail", "scene"];

function selectBlogStyle(category: string, imageIndex: number): BlogImageStyle {
  const styles = CATEGORY_STYLE_MAP[category] ?? DEFAULT_STYLES;
  return styles[imageIndex % styles.length];
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

const HAIKU_SYSTEM_PROMPT = `You generate image prompts for Nano Banana Pro (an AI image generator) to create editorial images for a Swedish health & wellness blog. Images must look like real photography from a Scandinavian lifestyle magazine — warm, inviting, and pleasant to look at.

The image MUST be directly relevant to the section it appears in. Read the section heading and alt text carefully — the image should illustrate THAT specific topic, not a generic health image.

Three styles:

1. editorial: Warm lifestyle magazine photography. Cozy bedroom scenes, soft morning light through sheer curtains, neatly arranged pillows on a bed, a person sleeping peacefully (seen from behind, no face), Scandinavian-style interiors with light wood and neutral tones. Camera: Canon EOS R5, 35mm f/1.8. Soft golden hour or overcast daylight. Slight film grain, Kodak Portra 400 tones. Warm whites and muted earth tones.

2. detail: Clean close-up photography. Fabric textures, pillow stitching, soft linen folds, water droplets on skin, supplement bottles on a marble counter, a hand resting on a pillow. Shallow depth of field (f/2.0), macro feel. Camera: Sony A7IV with 90mm macro. Soft directional window light. Minimal composition — one subject, clean background. Warm neutral palette.

3. scene: Environmental context photography. Wider establishing shots — a tidy bedroom at dawn, a bathroom shelf with neatly arranged products, a reading nook with a pillow and blanket, a bright kitchen counter with morning light. Natural light from a specific direction (e.g., "warm light from a left-side window"). Light grain, slightly desaturated. Think Kinfolk magazine aesthetic.

CRITICAL — NEVER generate:
- Medical/clinical imagery (no cross-sections, CT scans, anatomy, blood, wounds, rashes, skin conditions)
- Messy, dirty, or unpleasant scenes (no stains, crumpled tissues, cluttered spaces)
- Anything gross, disturbing, or uncomfortable to look at
- Generic stock photo compositions (posed people smiling at camera, thumbs up)
- Dark or gloomy lighting

RULES:
- Prompts must be 80-120 words with specific visual detail
- Always name the light SOURCE and direction ("warm morning light from a right-side window")
- Include 1 texture keyword per prompt (linen, cotton, wood grain, marble, etc.)
- Warm, calming color palette — Scandinavian minimalism
- NEVER use: "photorealistic", "cinematic", "vibrant", "beautiful", "stunning", "professional lighting", "high quality"
- All images are 16:9 LANDSCAPE format — compose horizontally
- No text overlays, no brand names, no logos, no people's faces
- Each image must illustrate a DIFFERENT aspect of the article
- End each prompt with: "Editorial lifestyle photography, Scandinavian aesthetic."

Output ONLY a JSON array, no markdown fences:
[{"index": 0, "prompt": "...", "style": "editorial"}]`;

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

  console.log(`[blog-images] Found ${placeholders.length} placeholder images`);

  // Step 2: Generate prompts via Claude Haiku
  const { prompts, cost: haikuCost } = await generateImagePrompts(
    placeholders,
    articleTitle,
    primaryKeyword,
    category,
    contentBrief
  );

  console.log(`[blog-images] Generated ${prompts.length} image prompts (Haiku cost: $${haikuCost.toFixed(4)})`);

  // Step 3: Generate images in parallel
  const db = createServerSupabase();
  const urlMap: Record<string, string> = {};
  let generated = 0;
  let failed = 0;
  let totalImageCost = 0;

  const settled = await Promise.allSettled(
    prompts.map(async (imgPrompt) => {
      const placeholder = placeholders[imgPrompt.index];
      if (!placeholder) return;

      const label = `[blog-images] Image ${imgPrompt.index}`;
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
      const filePath = `blog/${slug}/${imgPrompt.index}.png`;
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
          image_index: imgPrompt.index,
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
  await db.from("usage_logs").insert({
    type: "blog_image_prompt",
    model: "claude-haiku",
    cost_usd: haikuCost,
    metadata: { slug, prompt_count: prompts.length },
  });

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

  // Get the hero image (primary product photo)
  const { data: images } = await db
    .from("product_images")
    .select("url")
    .eq("product_id", product.id)
    .eq("category", "hero")
    .limit(1);

  const imageUrl = images?.[0]?.url;
  if (!imageUrl) {
    console.log(`[blog-images] No hero image for product "${productSlug}", skipping`);
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
