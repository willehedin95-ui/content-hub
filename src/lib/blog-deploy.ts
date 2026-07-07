import { createServerSupabase } from "@/lib/supabase-admin";
import {
  getConfig,
  getProjectName,
  getProjectCustomDomain,
  getWorkspaceIdForCfProject,
  md5hex,
  mergeManifestForDeploy,
  checkMissingAssets,
  getUploadToken,
  uploadFiles,
  upsertHashes,
  createDeployment,
} from "@/lib/cloudflare-pages";
import {
  generateAboutPage,
  generateAuthorPage,
  generateBlogHomepage,
  generateCategoryPage,
  generateRssFeed,
  getAboutPath,
  getAuthorPath,
  getDefaultBlogConfig,
  slugifyCategory,
  type BlogArticleSummary,
  type BlogConfig,
} from "@/lib/blog-shell";
import type { Language } from "@/types";

/**
 * Fetch related articles ranked by topical similarity to a given source slug.
 *
 * Scoring (higher = more related, picked first):
 *  +5: same category
 *  +3: shared keyword from primary or secondary in content_plan
 *  +1: shared significant word in title (len >= 4, not stopword)
 *  +0.1: created recently (so ties break in favor of fresh content)
 *
 * Falls back to recency-ordered if no scoring signal available. Used by
 * publish flow to populate the related-articles sidebar with content
 * Google can use to confirm topical authority.
 */
export async function getRelatedArticles(
  language: Language,
  currentSlug: string,
  limit = 4
): Promise<BlogArticleSummary[]> {
  const db = createServerSupabase();

  // Scope to the workspace owning this language's CF project so slug
  // collisions across workspaces can't pick the wrong article.
  const relWorkspaceId = await getWorkspaceIdForCfProject(getProjectName(language));

  // Get current article's category + content_plan keywords
  let currentQuery = db
    .from("translations")
    .select("slug, seo_title, pages!inner(blog_category, content_type, workspace_id)")
    .eq("slug", currentSlug)
    .eq("language", language)
    .eq("pages.content_type", "seo_blog");
  if (relWorkspaceId) {
    currentQuery = currentQuery.eq("pages.workspace_id", relWorkspaceId);
  }
  const { data: current } = await currentQuery.limit(1).maybeSingle();
  const currentCategory = (current?.pages as unknown as { blog_category?: string })?.blog_category;
  const currentTitle = (current?.seo_title as string) || "";

  // Look up keyword data from content_plan if available
  const { data: planRow } = await db
    .from("blog_content_plan")
    .select("primary_keyword, secondary_keywords")
    .eq("slug", currentSlug)
    .eq("language", language)
    .maybeSingle();
  const currentKeywords: string[] = [
    ...(planRow?.primary_keyword ? [planRow.primary_keyword as string] : []),
    ...((planRow?.secondary_keywords as string[] | null) ?? []),
  ];

  // Pull all candidate articles
  const candidates = await getPublishedBlogArticles(language, currentSlug);
  if (candidates.length === 0) return [];

  // Extract significant words from current title for soft matching
  const stopwords = new Set([
    "att", "och", "för", "med", "som", "den", "det", "har", "kan", "till", "från", "vid", "var",
    "and", "for", "with", "the", "what", "how", "why", "when", "where", "this", "that",
    "der", "die", "das", "und", "ist", "auf", "mit", "den", "vom",
  ]);
  const titleWords = currentTitle
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 4 && !stopwords.has(w));

  // Pre-fetch keyword data for all candidates so we can score against them
  const slugs = candidates.map((c) => c.slug);
  const { data: planRows } = await db
    .from("blog_content_plan")
    .select("slug, primary_keyword, secondary_keywords")
    .eq("language", language)
    .in("slug", slugs);
  const planBySlug = new Map<string, { primary?: string; secondary: string[] }>();
  for (const row of planRows ?? []) {
    planBySlug.set(row.slug as string, {
      primary: (row.primary_keyword as string | undefined) || undefined,
      secondary: ((row.secondary_keywords as string[] | null) ?? []),
    });
  }

  // Score
  const scored = candidates.map((c) => {
    let score = 0;
    if (currentCategory && c.category === currentCategory) score += 5;

    const cPlan = planBySlug.get(c.slug);
    const cKeywords = [
      ...(cPlan?.primary ? [cPlan.primary] : []),
      ...((cPlan?.secondary as string[] | undefined) ?? []),
    ].map((k) => k.toLowerCase());
    for (const ck of cKeywords) {
      for (const myK of currentKeywords) {
        if (ck === myK.toLowerCase() || ck.includes(myK.toLowerCase()) || myK.toLowerCase().includes(ck)) {
          score += 3;
          break;
        }
      }
    }

    const cTitleLower = c.title.toLowerCase();
    for (const w of titleWords) {
      if (cTitleLower.includes(w)) score += 1;
    }

    // Tie-breaker: recency
    const ageMs = Date.now() - new Date(c.publishedAt || 0).getTime();
    score += Math.max(0, 0.1 - ageMs / (365 * 86400_000)); // tiny recency boost <365 days

    return { article: c, score };
  });

  // Sort by score, return top N (still ordered by recency within same score)
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.article);
}

/**
 * Fetch all published SEO blog articles for a language, scoped to the
 * workspace that owns the language's CF Pages project (audit 2026-07-07, E1:
 * halsobladet's homepage/RSS listed doginwork + hydro13 articles).
 *
 * Pass `workspaceId` to scope explicitly (e.g. from a caller that already
 * knows the workspace); otherwise it is resolved via the CF-project mapping.
 */
export async function getPublishedBlogArticles(
  language: Language,
  excludeSlug?: string,
  workspaceId?: string
): Promise<BlogArticleSummary[]> {
  const db = createServerSupabase();

  let wsId = workspaceId;
  if (!wsId) {
    const projectName = getProjectName(language);
    wsId = (await getWorkspaceIdForCfProject(projectName)) ?? undefined;
    if (!wsId) {
      console.warn(
        `[getPublishedBlogArticles] No workspace mapping for CF project "${projectName}" - returning no articles to avoid cross-workspace leakage`
      );
      return [];
    }
  }

  const query = db
    .from("translations")
    .select(
      "slug, seo_title, seo_description, updated_at, created_at, pages!inner(content_type, blog_category, blog_featured_image_url, workspace_id)"
    )
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", wsId)
    .not("slug", "is", null);

  if (excludeSlug) {
    query.neq("slug", excludeSlug);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error(`[getPublishedBlogArticles] query failed: ${error.message}`);
    return [];
  }

  // Dedupe by slug - duplicate published rows exist in legacy data and the
  // homepage/RSS must list each article once. Newest (first) wins.
  const seenSlugs = new Set<string>();

  return (data ?? []).filter((t) => {
    if (!t.slug || seenSlugs.has(t.slug)) return false;
    seenSlugs.add(t.slug);
    return true;
  }).map((t) => {
    const page = t.pages as unknown as {
      blog_category?: string;
      blog_featured_image_url?: string;
    };
    const category = page?.blog_category || undefined;
    return {
      title: t.seo_title || t.slug || "",
      slug: t.slug || "",
      categorySlug: category ? slugifyCategory(category) : undefined,
      excerpt: t.seo_description || "",
      featuredImageUrl: page?.blog_featured_image_url || undefined,
      category,
      publishedAt: t.created_at,
    };
  });
}

/**
 * Deploy the blog homepage (/index.html) for a language.
 * Lists all published seo_blog articles in a card grid.
 */
export async function deployBlogHomepage(
  language: Language,
  blogConfig?: BlogConfig
): Promise<{ url: string; deploy_id: string }> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);
  const domain = getProjectCustomDomain(language);
  if (!domain)
    throw new Error(`No custom domain configured for language: ${language}`);
  const baseUrl = `https://${domain}`;

  const config = blogConfig ?? getDefaultBlogConfig();
  const articles = await getPublishedBlogArticles(language);

  const homepageHtml = generateBlogHomepage({
    articles,
    language,
    blogConfig: config,
    baseUrl,
  });

  const htmlBuffer = Buffer.from(homepageHtml, "utf-8");
  const htmlHash = md5hex(htmlBuffer);

  const newFiles: Array<{ path: string; hash: string; content: Buffer; contentType: string }> = [
    {
      path: "/index.html",
      hash: htmlHash,
      content: htmlBuffer,
      contentType: "text/html",
    },
  ];

  // CF Pages defaults Referrer-Policy to strict-origin-when-cross-origin,
  // which strips the path from Referer headers cross-origin. We need the full
  // URL so Shopify order attribution (shopify.ts getOrdersByPage referrer
  // fallback) can pin conversions to specific article slugs. A `_headers`
  // file at the project root overrides the CF default site-wide.
  const headersContent = Buffer.from(
    "/*\n  Referrer-Policy: no-referrer-when-downgrade\n",
    "utf-8"
  );
  newFiles.push({
    path: "/_headers",
    hash: md5hex(headersContent),
    content: headersContent,
    contentType: "text/plain",
  });

  // Generate category index pages
  const categoryMap = new Map<string, { name: string; slug: string; articles: BlogArticleSummary[] }>();
  for (const a of articles) {
    if (a.category && a.categorySlug) {
      if (!categoryMap.has(a.categorySlug)) {
        categoryMap.set(a.categorySlug, { name: a.category, slug: a.categorySlug, articles: [] });
      }
      categoryMap.get(a.categorySlug)!.articles.push(a);
    }
  }
  for (const [, cat] of categoryMap) {
    const catHtml = generateCategoryPage({
      categoryName: cat.name,
      categorySlug: cat.slug,
      articles: cat.articles,
      language,
      blogConfig: config,
      baseUrl,
    });
    const catBuffer = Buffer.from(catHtml, "utf-8");
    newFiles.push({
      path: `/${cat.slug}/index.html`,
      hash: md5hex(catBuffer),
      content: catBuffer,
      contentType: "text/html",
    });
  }

  // Static EEAT pages: /om-oss/ and /forfattare/erik-lindberg/. These give
  // Google a real entity to resolve the author byline against and a separate
  // About page describing the publisher. Without them the byline is cosmetic
  // and the org has no authoritative description page.
  const aboutHtml = generateAboutPage({ language, blogConfig: config, baseUrl });
  if (aboutHtml) {
    const aboutBuf = Buffer.from(aboutHtml, "utf-8");
    newFiles.push({
      path: `/${getAboutPath(language)}/index.html`,
      hash: md5hex(aboutBuf),
      content: aboutBuf,
      contentType: "text/html",
    });
  }
  const authorHtml = generateAuthorPage({ language, blogConfig: config, baseUrl });
  if (authorHtml) {
    const authorBuf = Buffer.from(authorHtml, "utf-8");
    newFiles.push({
      path: `/${getAuthorPath(language)}/index.html`,
      hash: md5hex(authorBuf),
      content: authorBuf,
      contentType: "text/html",
    });
  }

  const deploy = await uploadAndDeploy(accountId, apiToken, projectName, newFiles);

  return {
    url: `${baseUrl}/`,
    deploy_id: deploy.id,
  };
}

/**
 * Shared deploy tail: CF check-missing based upload dedupe + deploy with the
 * post-merge manifest (closes the concurrent-deploy manifest race).
 * (audit 2026-07-07, P2 manifest-race + CF-dedupe)
 */
async function uploadAndDeploy(
  accountId: string,
  apiToken: string,
  projectName: string,
  newFiles: Array<{ path: string; hash: string; content: Buffer; contentType: string }>
): Promise<{ id: string; url: string }> {
  const jwt = await getUploadToken(accountId, apiToken, projectName);

  const uniqueHashes = Array.from(new Set(newFiles.map((f) => f.hash)));
  let missing: Set<string>;
  try {
    missing = await checkMissingAssets(jwt, uniqueHashes);
  } catch (err) {
    console.warn(
      `[blog-deploy] check-missing failed - falling back to full upload:`,
      err instanceof Error ? err.message : err
    );
    missing = new Set(uniqueHashes);
  }
  const seen = new Set<string>();
  const filesToUpload = newFiles.filter((f) => {
    if (!missing.has(f.hash) || seen.has(f.hash)) return false;
    seen.add(f.hash);
    return true;
  });

  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
  }
  await upsertHashes(jwt, uniqueHashes);

  const newPathsOnly: Record<string, string> = {};
  for (const f of newFiles) newPathsOnly[f.path] = f.hash;
  const mergedManifest = await mergeManifestForDeploy(projectName, newPathsOnly);

  return createDeployment(accountId, apiToken, projectName, mergedManifest);
}

/**
 * Deploy the RSS feed (/rss.xml) for a language.
 * Called alongside homepage after every blog publish.
 */
export async function deployBlogRssFeed(
  language: Language,
  blogConfig?: BlogConfig
): Promise<{ url: string; deploy_id: string }> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);
  const domain = getProjectCustomDomain(language);
  if (!domain)
    throw new Error(`No custom domain configured for language: ${language}`);
  const baseUrl = `https://${domain}`;

  const config = blogConfig ?? getDefaultBlogConfig();
  const articles = await getPublishedBlogArticles(language);

  const rssXml = generateRssFeed({
    articles,
    language,
    blogConfig: config,
    baseUrl,
  });

  const rssBuffer = Buffer.from(rssXml, "utf-8");
  const rssHash = md5hex(rssBuffer);

  const newFiles = [
    {
      path: "/rss.xml",
      hash: rssHash,
      content: rssBuffer,
      contentType: "application/rss+xml",
    },
  ];

  const deploy = await uploadAndDeploy(accountId, apiToken, projectName, newFiles);

  return {
    url: `${baseUrl}/rss.xml`,
    deploy_id: deploy.id,
  };
}
