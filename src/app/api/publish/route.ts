import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { publishPage, deploySitemapAndRobots, getProjectCustomDomain, PageAnalyticsConfig } from "@/lib/cloudflare-pages";
import { optimizeImages } from "@/lib/image-optimizer";
import { replaceImageUrls } from "@/lib/html-image-replacer";
import { Language } from "@/types";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { extractArticleBody, extractFirstImage, extractMetaDescription, autoFillAltText, wrapInBlogShell, getDefaultBlogConfig, slugifyCategory, type BlogConfig } from "@/lib/blog-shell";
import { getPublishedBlogArticles, deployBlogHomepage, deployBlogRssFeed } from "@/lib/blog-deploy";

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
  const workspaceId = await getWorkspaceId();

  // Fetch translation + page (with workspace verification)
  const { data: translation, error: tError } = await db
    .from("translations")
    .select(`*, pages (slug, source_url, custom_head_code, workspace_id, content_type, blog_category, blog_featured_image_url)`)
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  // Verify workspace access through parent page
  const publishPages = translation.pages as { slug: string; source_url: string; custom_head_code?: string; workspace_id?: string; content_type?: string; blog_category?: string; blog_featured_image_url?: string } | null;
  if (publishPages?.workspace_id && publishPages.workspace_id !== workspaceId) {
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

    // Compute deploy path (includes category prefix for blog pages)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageDataEarly = translation.pages as any;
    const blogCategorySlug = pageDataEarly?.content_type === "seo_blog" && pageDataEarly?.blog_category
      ? slugifyCategory(pageDataEarly.blog_category)
      : undefined;
    const deploySlug = blogCategorySlug ? `${blogCategorySlug}/${slug}` : slug;

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

    let imageWarnings = "";
    if (imageResult.stats.errors.length > 0) {
      console.warn(`[publish] Image optimization errors:`, imageResult.stats.errors);
      imageWarnings = `${imageResult.stats.errors.length} image(s) failed to optimize`;
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

    // Blog shell: wrap seo_blog pages in blog template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageData = translation.pages as any;
    const isBlogPage = pageData?.content_type === "seo_blog";

    if (isBlogPage) {
      const appSettings_ = await getWorkspaceSettings();
      const blogConfig = (appSettings_.blog_config as BlogConfig) ?? getDefaultBlogConfig();
      const domain = getProjectCustomDomain(language);
      const baseUrl = domain ? `https://${domain}` : "";

      const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(html);
      const articleTitle = (translation.seo_title as string) || slug;
      // Auto-fill empty/placeholder alt text on images before wrapping
      const bodyHtml = autoFillAltText(rawBodyHtml, articleTitle);
      const relatedArticles = await getPublishedBlogArticles(language, slug);
      const featuredImage =
        pageData?.blog_featured_image_url || extractFirstImage(bodyHtml);

      html = wrapInBlogShell({
        articleBodyHtml: bodyHtml,
        articleHeadHtml: headHtml,
        seoTitle: articleTitle,
        seoDescription: (translation.seo_description as string) || extractMetaDescription(bodyHtml),
        slug,
        language,
        blogConfig,
        relatedArticles,
        featuredImageUrl: featuredImage,
        blogCategory: pageData?.blog_category || undefined,
        publishedAt: translation.created_at as string,
        updatedAt: (translation.updated_at as string) || new Date().toISOString(),
        baseUrl,
      });
    }

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
      contentType: pageDataEarly?.content_type || undefined,
    };

    // Report progress: deploying to Cloudflare
    await db
      .from("translations")
      .update({ publish_step: "deploying" })
      .eq("id", translationId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customCode = (translation.pages as any)?.custom_head_code || "";

    const result = await publishPage(
      html,
      deploySlug,
      language,
      additionalFiles,
      undefined,
      analytics,
      customCode,
    );

    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url.trim(),
        publish_error: imageWarnings || null,
        publish_step: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    // Fire-and-forget: regenerate sitemap for this language
    deploySitemapAndRobots(language).catch((err) =>
      console.warn("[publish] Sitemap update failed:", err)
    );

    // Fire-and-forget: regenerate blog homepage + RSS feed if this is a blog page
    if (isBlogPage) {
      deployBlogHomepage(language).catch((err) =>
        console.warn("[publish] Blog homepage update failed:", err)
      );
      deployBlogRssFeed(language).catch((err) =>
        console.warn("[publish] Blog RSS feed update failed:", err)
      );
    }

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
