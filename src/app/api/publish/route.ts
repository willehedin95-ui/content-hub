import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishPage } from "@/lib/netlify";
import { optimizeImages } from "@/lib/image-optimizer";
import { replaceImageUrls } from "@/lib/html-image-replacer";
import { Language } from "@/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  const netlifyToken = process.env.NETLIFY_TOKEN;
  if (!netlifyToken) {
    return NextResponse.json(
      { error: "Netlify token not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Fetch translation + page
  const { data: translation, error: tError } = await db
    .from("translations")
    .select(`*, pages (slug, source_url)`)
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  if (!translation.translated_html) {
    return NextResponse.json(
      { error: "Translation has no HTML content. Translate first." },
      { status: 400 }
    );
  }

  const siteIdEnvKey = `NETLIFY_SITE_ID_${translation.language.toUpperCase()}`;
  const siteId = process.env[siteIdEnvKey];

  if (!siteId) {
    return NextResponse.json(
      {
        error: `Netlify site ID not configured for language: ${translation.language}. Set ${siteIdEnvKey} in environment variables.`,
      },
      { status: 500 }
    );
  }

  // Mark as publishing
  await db
    .from("translations")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", translation_id);

  try {
    let html = translation.translated_html as string;
    const language = translation.language as Language;
    const slug = translation.slug || translation.pages.slug;
    const slugPrefix = slug;

    // Optimize images: download, convert to WebP, prepare for deploy
    const imageResult = await optimizeImages(html, slugPrefix);

    if (imageResult.stats.errors.length > 0) {
      console.warn(`[publish] Image optimization errors:`, imageResult.stats.errors);
    }

    // Replace image URLs in HTML with optimized deploy paths
    if (imageResult.urlMap.size > 0) {
      html = replaceImageUrls(html, imageResult.urlMap);
    }

    // Build additional files for deploy
    const additionalFiles = imageResult.images.map((img) => ({
      path: img.deployPath,
      sha1: img.sha1,
      body: img.buffer,
    }));

    const result = await publishPage(
      html,
      slug,
      language,
      netlifyToken,
      siteId,
      additionalFiles
    );

    const { data: updated, error: updateError } = await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";

    await db
      .from("translations")
      .update({ status: "translated", updated_at: new Date().toISOString() })
      .eq("id", translation_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
