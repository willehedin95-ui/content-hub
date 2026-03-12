import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishPage, PageAnalyticsConfig } from "@/lib/cloudflare-pages";
import { optimizeImages } from "@/lib/image-optimizer";
import { replaceImageUrls } from "@/lib/html-image-replacer";
import { Language } from "@/types";
import { getWorkspaceSettings } from "@/lib/workspace";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  if (!process.env.CF_PAGES_ACCOUNT_ID || !process.env.CF_PAGES_API_TOKEN) {
    return NextResponse.json(
      { error: "Cloudflare Pages not configured. Set CF_PAGES_ACCOUNT_ID and CF_PAGES_API_TOKEN." },
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

  const projectKey = `CF_PAGES_PROJECT_${translation.language.toUpperCase()}`;
  if (!process.env[projectKey]) {
    return NextResponse.json(
      { error: `Cloudflare Pages project not configured for language: ${translation.language}. Set ${projectKey}.` },
      { status: 500 }
    );
  }

  // Mark as publishing + clear any previous error
  await db
    .from("translations")
    .update({
      status: "publishing",
      publish_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", translation_id);

  // Run publish after response is sent — keeps Vercel function alive until done
  after(async () => {
    try {
      await doPublish(translation_id, translation, db);
    } catch (err) {
      console.error("[publish] Background publish failed:", err);
    }
  });

  return NextResponse.json({ ok: true });
}

/** Background publish work — runs after response is sent */
async function doPublish(
  translationId: string,
  translation: Record<string, unknown>,
  db: ReturnType<typeof createServerSupabase>
) {
  try {
    let html = translation.translated_html as string;
    const language = translation.language as Language;
    const pages = translation.pages as { slug: string; source_url: string };
    const slug = (translation.slug as string) || pages.slug;
    const slugPrefix = slug;

    // Fix font-display: optional → swap
    html = html.replace(/font-display:\s*optional/g, "font-display: swap");

    // Strip editor CSS artifacts
    html = html.replace(/<style[^>]*data-cc-exclude-mode[^>]*>[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<style[^>]*data-cc-custom[^>]*>[\s\S]*?<\/style>/gi, (match) => {
      let css = match.replace(/\[data-cc-padded\](?::hover)?[^{]*\{[^}]*outline[^}]*\}/g, "");
      css = css.replace(/\[data-cc-pad-skip\][^{]*\{[^}]*\}/g, "");
      return css;
    });
    html = html.replace(/ data-cc-padded(?:="[^"]*")?/g, "");
    html = html.replace(/ data-cc-pad-skip(?:="[^"]*")?/g, "");
    html = html.replace(/ data-cc-editable(?:="[^"]*")?/g, "");
    html = html.replace(/ data-cc-hidden(?:="[^"]*")?/g, "");
    html = html.replace(/ contenteditable="[^"]*"/g, "");

    // Report progress: optimizing images
    await db
      .from("translations")
      .update({ publish_step: "optimizing_images" })
      .eq("id", translationId);

    // Optimize images
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

    // Load analytics settings
    const appSettings = await getWorkspaceSettings();
    const ga4Ids = (appSettings.ga4_measurement_ids as Record<string, string>) ?? {};
    const excludedIps = (appSettings.excluded_ips as string[]) ?? [];
    const analytics: PageAnalyticsConfig = {
      ga4MeasurementId: ga4Ids[language] || undefined,
      clarityProjectId:
        (appSettings.clarity_project_ids as Record<string, string>)?.[language] ||
        (appSettings.clarity_project_id as string) ||
        undefined,
      shopifyDomains: ((appSettings.shopify_domains as string) || "")
        .split(",")
        .map((d: string) => d.trim())
        .filter(Boolean),
      metaPixelId: (appSettings.meta_pixel_id as string) || undefined,
      hubUrl: process.env.APP_URL || undefined,
      excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
    };

    // Report progress: deploying to Cloudflare
    await db
      .from("translations")
      .update({ publish_step: "deploying" })
      .eq("id", translationId);

    const result = await publishPage(
      html,
      slug,
      language,
      additionalFiles,
      undefined,
      analytics
    );

    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url.trim(),
        publish_error: null,
        publish_step: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    // Fire-and-forget: capture page thumbnail for the selector modal
    const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    fetch(`${appUrl}/api/pages/${translation.page_id}/screenshot`, {
      method: "POST",
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    console.error(`[publish] Failed for translation ${translationId}:`, message);

    await db
      .from("translations")
      .update({
        status: "error",
        publish_error: message,
        publish_step: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);
  }
}
