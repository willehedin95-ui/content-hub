import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { publishPage, deploySitemapAndRobots, getProjectCustomDomain, PageAnalyticsConfig } from "@/lib/cloudflare-pages";
import { optimizeImages, enhanceImageTags } from "@/lib/image-optimizer";
import { replaceImageUrls } from "@/lib/html-image-replacer";
import { Language } from "@/types";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { extractArticleBody, extractFirstImage, extractMetaDescription, autoFillAltText, wrapInBlogShell, getDefaultBlogConfig, slugifyCategory, injectBlogUTMs, type BlogConfig } from "@/lib/blog-shell";
import { getPublishedBlogArticles, deployBlogHomepage, deployBlogRssFeed } from "@/lib/blog-deploy";
import { publishToShopify } from "@/lib/shopify-blog-publish";
import { runDeployStep } from "@/lib/deploy-failures";

// 300 (was 120): the Shopify blog path uploads inline images to Shopify's
// Files API which can take minutes; CF path unaffected. Vercel PRO cap 800.
export const maxDuration = 300;

interface PublishPageData {
  slug: string;
  source_url: string;
  custom_head_code?: string;
  workspace_id?: string;
  content_type?: string;
  blog_category?: string;
  blog_featured_image_url?: string;
}

export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
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
  const publishPages = translation.pages as PublishPageData | null;
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

  // ---------------------------------------------------------------------
  // Routing decision (audit 2026-07-07, E3): seo_blog pages in workspaces
  // with blog_publish_target="shopify" (hydro13/Renew) must go through the
  // Shopify publisher - the manual publish button used to ignore the target
  // and deploy hydro13 articles to halsobladet.com (duplicate content).
  // ---------------------------------------------------------------------
  const wsSettings = await getWorkspaceSettings();
  const publishTarget = (wsSettings.blog_publish_target as string) || "cf_pages";
  const isBlogPage = publishPages?.content_type === "seo_blog";
  const useShopify = isBlogPage && publishTarget === "shopify";

  if (!useShopify) {
    if (publishTarget === "shopify") {
      // Non-blog page in a Shopify-target workspace: landing pages still go
      // to CF, but make the routing explicit rather than silent.
      console.warn(
        `[publish] workspace has blog_publish_target=shopify but page is ${publishPages?.content_type || "landing_page"} - using CF Pages`
      );
    }

    if (!process.env.CF_PAGES_ACCOUNT_ID || !process.env.CF_PAGES_API_TOKEN) {
      return NextResponse.json(
        { error: "Cloudflare Pages not configured. Set CF_PAGES_ACCOUNT_ID and CF_PAGES_API_TOKEN." },
        { status: 500 }
      );
    }

    const projectKey = `CF_PAGES_PROJECT_${translation.language.toUpperCase()}`;
    if (!process.env[projectKey]) {
      return NextResponse.json(
        { error: `Cloudflare Pages project not configured for language: ${translation.language}. Set ${projectKey}.` },
        { status: 500 }
      );
    }

    // Slug-collision guard (audit E2): refuse to deploy onto a CF path that
    // another PUBLISHED translation already owns on the same (language,
    // CF project) - the last deploy used to silently overwrite the other
    // page and leave its published_url lying.
    const conflict = await findPublishedSlugConflict(db, translation, publishPages);
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
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
      if (useShopify) {
        await doShopifyPublish(translation_id, translation, db, publishPages?.workspace_id || workspaceId);
      } else {
        await doPublish(translation_id, translation, db);
      }
    } catch (err) {
      console.error("[publish] Background publish failed:", err);
    }
  });

  return NextResponse.json({ ok: true });
}

/**
 * Returns an error message if the effective CF deploy path for this
 * translation is already occupied by a DIFFERENT published translation in
 * the same language (= same CF Pages project). Shopify-published rows
 * (published_url on another domain) don't block the CF path.
 */
async function findPublishedSlugConflict(
  db: ReturnType<typeof createServerSupabase>,
  translation: Record<string, unknown>,
  publishPages: PublishPageData | null
): Promise<string | null> {
  const language = translation.language as Language;
  const slug = (translation.slug as string) || publishPages?.slug;
  if (!slug) return null;

  const myCatSlug =
    publishPages?.content_type === "seo_blog" && publishPages?.blog_category
      ? slugifyCategory(publishPages.blog_category)
      : undefined;
  const myDeployPath = myCatSlug ? `${myCatSlug}/${slug}` : slug;

  const { data: others, error } = await db
    .from("translations")
    .select("id, slug, published_url, pages!inner(id, name, slug, content_type, blog_category, workspace_id)")
    .eq("language", language)
    .eq("status", "published")
    .neq("id", translation.id as string);

  if (error) {
    // Fail open with a log - blocking every publish on a check error would
    // be worse than the (rare) collision.
    console.error("[publish] slug-conflict check failed:", error.message);
    return null;
  }

  const cfDomain = getProjectCustomDomain(language);
  const myWorkspaceId = publishPages?.workspace_id;
  const myUrl = ((translation.published_url as string | null) || "").replace(/\/+$/, "");

  for (const other of others ?? []) {
    const oPage = other.pages as unknown as {
      id: string;
      name?: string;
      slug?: string;
      content_type?: string;
      blog_category?: string;
      workspace_id?: string;
    } | null;
    const oSlug = (other.slug as string) || oPage?.slug;
    if (!oSlug) continue;
    const oCatSlug =
      oPage?.content_type === "seo_blog" && oPage?.blog_category
        ? slugifyCategory(oPage.blog_category)
        : undefined;
    const oDeployPath = oCatSlug ? `${oCatSlug}/${oSlug}` : oSlug;
    if (oDeployPath !== myDeployPath) continue;

    // Same page family (variant of the same page) republishing over itself
    // is allowed only when it IS the same translation - different translation
    // rows with the same path are exactly the overwrite bug.
    // Skip rows that were published to a non-CF surface (e.g. Shopify).
    const url = (other.published_url as string | null) || "";
    const onCf = !url || (cfDomain ? url.includes(cfDomain) : true);
    if (!onCf) continue;

    // Zombie duplicates (audit follow-up F1): a row in ANOTHER workspace
    // whose published_url is identical to OUR live URL is a leftover
    // duplicate row of the same article, not a foreign occupation - it
    // must not block a republish. Genuine foreign pages on the same path
    // (different or missing URL) still block.
    const normUrl = url.replace(/\/+$/, "");
    if (
      myUrl &&
      normUrl === myUrl &&
      myWorkspaceId &&
      oPage?.workspace_id &&
      oPage.workspace_id !== myWorkspaceId
    ) {
      continue;
    }

    return (
      `Slug "${myDeployPath}" is already live on this domain for another page` +
      `${oPage?.name ? ` ("${oPage.name}")` : ""}${url ? ` at ${url}` : ""}. ` +
      `Publishing would overwrite it - change the slug first.`
    );
  }

  return null;
}

/**
 * Shopify blog publish path (audit E3) - same flow the review/approve route
 * uses, adapted for the manual publish button. Runs in after().
 */
async function doShopifyPublish(
  translationId: string,
  translation: Record<string, unknown>,
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string
) {
  try {
    const pageData = translation.pages as PublishPageData;
    const language = translation.language as Language;
    const slug = (translation.slug as string) || pageData.slug;

    await db
      .from("translations")
      .update({ publish_step: "deploying" })
      .eq("id", translationId);

    // Known published slugs on the target blog (for internal-link rewriting)
    const { data: others } = await db
      .from("translations")
      .select("slug, pages!inner(workspace_id, content_type)")
      .eq("language", language)
      .eq("status", "published")
      .eq("pages.content_type", "seo_blog")
      .eq("pages.workspace_id", workspaceId);
    const knownSlugs = (others ?? []).map((t) => t.slug as string).filter(Boolean);

    const sourceBlogDomain =
      process.env[`CF_PAGES_DOMAIN_${language.toUpperCase()}`]?.trim() || "halsobladet.com";

    const result = await publishToShopify({
      articleHtml: translation.translated_html as string,
      slug,
      category: pageData.blog_category || "Kollagen",
      seoTitle: (translation.seo_title as string) || slug,
      seoDescription: (translation.seo_description as string) || "",
      language,
      workspaceId,
      sourceBlogDomain,
      createdAt: translation.created_at as string,
      knownSlugs,
    });

    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url.trim(),
        published_at: new Date().toISOString(),
        publish_error: null,
        publish_step: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify publish failed";
    console.error(`[publish] Shopify publish failed for translation ${translationId}:`, message);
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

    // Defense in depth (audit E3): never CF-deploy a blog page whose
    // workspace publishes its blog via Shopify. The POST handler routes
    // these to doShopifyPublish; if we still end up here, fail loudly
    // instead of shipping duplicate content to halsobladet.com.
    const guardPage = translation.pages as PublishPageData | null;
    if (guardPage?.content_type === "seo_blog" && guardPage.workspace_id) {
      const { data: ws } = await db
        .from("workspaces")
        .select("settings")
        .eq("id", guardPage.workspace_id)
        .maybeSingle();
      const target = ((ws?.settings ?? {}) as Record<string, unknown>).blog_publish_target;
      if (target === "shopify") {
        throw new Error(
          "This workspace publishes blog articles to Shopify (blog_publish_target=shopify) - CF Pages deploy blocked."
        );
      }
    }

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

    const imageWarningParts: string[] = [];
    if (imageResult.stats.errors.length > 0) {
      console.warn(`[publish] Image optimization errors:`, imageResult.stats.errors);
      imageWarningParts.push(`${imageResult.stats.errors.length} image(s) failed to optimize`);
    }
    if (imageResult.stats.truncated > 0) {
      // Overflow beyond the optimizer cap ships UNoptimized origin URLs -
      // surface it instead of deploying silently (audit 2026-07-07, P3).
      imageWarningParts.push(
        `${imageResult.stats.truncated} image(s) exceeded the optimizer cap and were deployed unoptimized`
      );
    }
    const imageWarnings = imageWarningParts.join(" | ");

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
      const bodyHtmlAlt = autoFillAltText(rawBodyHtml, articleTitle);
      // Inject UTM params on Shopify product links for order attribution
      const bodyHtml = injectBlogUTMs(bodyHtmlAlt, slug);
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

      // Add loading="lazy" + width/height + fetchpriority to article <img> tags
      html = enhanceImageTags(html, imageResult.images);
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

    // 2026-04-16: Surface post-deploy verification failure as a publish_error
    // so the user sees a warning next to the "published" badge. Also fire a
    // Telegram alert — this is the signal we were missing during the
    // halsobladet manifest wipe. See resilience-audit-2026-04-16.md P1-1.
    let verifyWarning = "";
    if (result.verification && !result.verification.ok) {
      verifyWarning = `Post-deploy check failed: ${result.verification.reason ?? "unknown"}`;
      console.error(`[publish] ${verifyWarning} (${result.url})`);
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (chatId) {
        try {
          const { sendTelegramNotification } = await import("@/lib/telegram");
          await sendTelegramNotification(
            chatId,
            `⚠️ *Deploy verification failed*\n\n` +
              `URL: \`${result.url}\`\n` +
              `Reason: \`${result.verification.reason ?? "unknown"}\`\n` +
              `Status: \`${result.verification.status ?? "-"}\`\n` +
              `Body bytes: \`${result.verification.bodyBytes ?? "-"}\`\n\n` +
              `Page was deployed but is not serving valid HTML. Check immediately.`
          );
        } catch (tgErr) {
          console.error("[publish] Telegram verify alert failed:", tgErr);
        }
      }
    }

    const combinedWarning = [imageWarnings, verifyWarning].filter(Boolean).join(" | ");

    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url.trim(),
        published_at: new Date().toISOString(),
        publish_error: combinedWarning || null,
        publish_step: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    // 2026-04-16: These used to be fire-and-forget with silent .catch() — if
    // any failed, the homepage/RSS/sitemap silently went stale. Now awaited
    // via runDeployStep which records failures + sends a Telegram alert.
    // Errors don't abort the rest (translation is already marked published).
    // See resilience-audit-2026-04-16.md (P0-3).
    const deployContext = {
      language,
      workspaceId: pageDataEarly?.workspace_id as string | undefined,
      targetId: translationId,
    };
    await runDeployStep("sitemap", deployContext, () =>
      deploySitemapAndRobots(language)
    );
    if (isBlogPage) {
      await runDeployStep("blog_homepage", deployContext, () =>
        deployBlogHomepage(language)
      );
      await runDeployStep("blog_rss", deployContext, () =>
        deployBlogRssFeed(language)
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
