/**
 * Article updater: regenerate existing published articles to improve rankings.
 *
 * Pairs with gsc-gaps.ts which detects LOW_RANK opportunities (queries where
 * a dedicated article ranks position 5-20). Those gaps were previously
 * surfaced in the UI but never actioned. This module closes the loop.
 *
 * Approach:
 * 1. Pull LOW_RANK gaps for a workspace+language
 * 2. Pick the highest-impression one with no recent update (>30 days)
 * 3. Fetch the existing article + GSC query data
 * 4. Re-run blog-writer with an "update brief" injected (current keyword
 *    coverage gaps, position context, what readers searched for that didn't
 *    convert)
 * 5. Republish via the normal publish path (cf_pages or shopify)
 *
 * Why this is high-ROI:
 * - Going from pos 8 -> pos 3 is ~5x CTR uplift on same impression base
 * - Targeting an article we already have indexed costs no new domain
 *   authority - we're just helping Google understand it better
 * - Existing article has internal links + age = trust signals new articles lack
 *
 * Trigger: weekly cron (after gsc-gap-refresh). 1 article per workspace per
 * run to avoid bulk-regen flagging as spam.
 */

import { createServerSupabase } from "./supabase-admin";
import { detectGapKeywords, type GapKeyword } from "./gsc-gaps";
import { generateBlogArticle } from "./blog-writer";
import { publishBlogArticle } from "./blog-autopilot";
import { sendTelegramNotification, escapeHtml } from "./telegram";
import { getProjectCustomDomain } from "./cloudflare-pages";
import type { Language } from "@/types";

const MIN_DAYS_SINCE_UPDATE = 30;

export interface UpdateCandidate {
  gap: GapKeyword;
  translationId: string;
  pageId: string;
  slug: string;
  currentTitle: string;
  currentSlug: string;
  daysSinceUpdate: number;
}

/**
 * Find the best LOW_RANK gap to action: highest-impression query where the
 * existing article hasn't been touched in MIN_DAYS_SINCE_UPDATE days.
 */
export async function pickArticleToUpdate(
  workspaceId: string,
  language: Language
): Promise<UpdateCandidate | null> {
  const db = createServerSupabase();

  // Get all LOW_RANK gaps for this workspace+language
  const gaps = await detectGapKeywords(workspaceId, language, {
    windowDays: 30,
    minImpressions: 10,
    limit: 50,
  });
  const lowRankGaps = gaps.filter((g) => g.type === "low_rank");
  if (lowRankGaps.length === 0) return null;

  // For each gap, find the existing translation and check last-update age
  for (const gap of lowRankGaps) {
    // gap.topPage looks like https://halsobladet.com/sov-battre/basta-kudden/
    // Extract slug from URL (last path segment, strip trailing slash)
    const url = new URL(gap.topPage || "");
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length < 1) continue;
    const slug = pathSegments[pathSegments.length - 1];

    // Find translation
    const { data: trans } = await db
      .from("translations")
      .select("id, slug, page_id, updated_at, seo_title, pages!inner(workspace_id, content_type)")
      .eq("slug", slug)
      .eq("language", language)
      .eq("status", "published")
      .eq("pages.workspace_id", workspaceId)
      .eq("pages.content_type", "seo_blog")
      .limit(1)
      .maybeSingle();

    if (!trans) continue;

    const updatedAt = trans.updated_at ? new Date(trans.updated_at as string) : new Date(0);
    const daysSinceUpdate = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);

    if (daysSinceUpdate < MIN_DAYS_SINCE_UPDATE) continue;

    return {
      gap,
      translationId: trans.id as string,
      pageId: trans.page_id as string,
      slug,
      currentTitle: (trans.seo_title as string) || slug,
      currentSlug: trans.slug as string,
      daysSinceUpdate,
    };
  }

  return null;
}

/**
 * Build an update brief for the article writer. Tells Claude:
 * - What query users are searching for that brought them to this article
 * - Current rank (so Claude knows there's runway)
 * - That existing content needs to be EXPANDED, not replaced wholesale
 *
 * The writer then regenerates the article with extra coverage targeted at
 * the missing keyword. We deliberately do NOT change the slug or URL -
 * Google should see this as a refresh of the same page, not a new page.
 */
export function buildUpdateBrief(
  candidate: UpdateCandidate,
  existingHtml: string
): {
  contentBrief: string;
  primaryKeyword: string;
} {
  const { gap, currentTitle } = candidate;

  // Extract existing H2 headings so the writer keeps the same structure
  const h2Matches = existingHtml.match(/<h2[^>]*>([^<]+)<\/h2>/gi) || [];
  const existingSections = h2Matches
    .map((m) => m.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  return {
    primaryKeyword: gap.query,
    contentBrief: `UPPDATERING av befintlig artikel "${currentTitle}".

Artikeln rankar position ${gap.avgPosition.toFixed(1)} på "${gap.query}" med ${gap.impressions} impressions/månad. Vi vill flytta den till topp 3 genom att utöka täckningen.

Behåll samma struktur (samma H2-rubriker) men:
1. Lägg till en EXPLICIT sektion som svarar på sökfrågan "${gap.query}" tidigt i artikeln (efter intro)
2. Säkerställ att exakt sökfras "${gap.query}" finns i title, H1, första stycket OCH ett H2
3. Lägg till FAQ-fråga som matchar sökfrågan i FAQ-sektionen
4. Utöka med 200-500 ord extra forskningsstöd kring detta specifika ämne

Befintliga H2:er:
${existingSections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Behåll datestamps - detta är en refresh, inte en omskrivning. Behåll alla cite-länkar till PubMed.`,
  };
}

// ---------------------------------------------------------------------------
// Runner: pick + regenerate + republish + notify
// ---------------------------------------------------------------------------

export interface UpdateResult {
  action: "updated" | "skipped" | "error";
  message: string;
  slug?: string;
  query?: string;
  previousPosition?: number;
  newWordCount?: number;
  cost?: number;
}

/**
 * Run a single LOW_RANK article refresh for a workspace+language.
 * Returns immediately with "skipped" if no candidate found.
 *
 * Opt-in per workspace via `blog_low_rank_updates_enabled: true`. Designed
 * to be called from a weekly cron - one article per workspace per run keeps
 * the refresh cadence well below any spam threshold.
 */
export async function runLowRankUpdate(
  workspaceId: string,
  language: Language
): Promise<UpdateResult> {
  const db = createServerSupabase();

  const { data: ws } = await db
    .from("workspaces")
    .select("settings, name")
    .eq("id", workspaceId)
    .single();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  if (settings.blog_low_rank_updates_enabled !== true) {
    return { action: "skipped", message: "Not opted in (blog_low_rank_updates_enabled)" };
  }

  const candidate = await pickArticleToUpdate(workspaceId, language);
  if (!candidate) {
    return { action: "skipped", message: "No LOW_RANK candidates found (>30 days since last update)" };
  }

  // Fetch existing translation HTML
  const { data: trans } = await db
    .from("translations")
    .select("translated_html, slug, seo_title, seo_description, created_at, page_id, pages!inner(blog_category, product, content_type)")
    .eq("id", candidate.translationId)
    .single();
  if (!trans?.translated_html) {
    return { action: "error", message: `Translation ${candidate.translationId} has no HTML` };
  }

  const brief = buildUpdateBrief(candidate, trans.translated_html as string);
  const pageRow = trans.pages as unknown as { blog_category: string; product: string };
  const blogDomain = getProjectCustomDomain(language) || "halsobladet.com";

  // Get sibling slugs for internal linking
  const { data: siblings } = await db
    .from("translations")
    .select("slug, pages!inner(workspace_id, content_type)")
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.workspace_id", workspaceId)
    .eq("pages.content_type", "seo_blog")
    .neq("id", candidate.translationId)
    .limit(40);
  const internalLinkSlugs = (siblings ?? []).map((s) => s.slug as string);

  // Regenerate
  const enableResearchCitations = settings.blog_research_citations === true;
  const naturalSwedishPass = settings.blog_natural_swedish_pass !== false;
  const article = await generateBlogArticle({
    title: trans.seo_title as string,
    slug: candidate.currentSlug,
    category: pageRow.blog_category,
    templateId: "problem-solution",
    primaryKeyword: brief.primaryKeyword,
    secondaryKeywords: [candidate.gap.query],
    wordCount: "2800-4000",
    contentBrief: brief.contentBrief,
    productSlug: pageRow.product,
    internalLinkSlugs,
    language,
    blogDomain,
    enableResearchCitations,
    naturalSwedishPass,
  });

  // Update DB
  await db
    .from("translations")
    .update({
      translated_html: article.html,
      seo_title: article.seoTitle,
      seo_description: article.seoDescription,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.translationId);

  await db
    .from("pages")
    .update({ original_html: article.html, updated_at: new Date().toISOString() })
    .eq("id", candidate.pageId);

  // Republish (same slug = same URL, refresh not new page)
  const publishUrl = await publishBlogArticle(
    article.html,
    candidate.currentSlug,
    pageRow.blog_category,
    article.seoTitle,
    article.seoDescription,
    language,
    workspaceId,
    candidate.translationId,
    (trans.created_at as string) || new Date().toISOString()
  );

  // Telegram
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      await sendTelegramNotification(
        chatId,
        `♻️ <b>Artikel uppdaterad (LOW_RANK refresh)</b>\n\n` +
          `Slug: <code>${escapeHtml(candidate.currentSlug)}</code>\n` +
          `Query: ${escapeHtml(candidate.gap.query)}\n` +
          `Före: pos ${candidate.gap.avgPosition.toFixed(1)} (${candidate.gap.impressions} impr/mån)\n` +
          `Ord: ${article.wordCount}\n` +
          `Kostnad: $${article.cost.toFixed(4)}\n\n` +
          `<a href="${publishUrl}">Läs</a>`
      );
    }
  } catch {
    // Non-critical
  }

  return {
    action: "updated",
    message: `Updated "${candidate.currentTitle}" targeting "${candidate.gap.query}"`,
    slug: candidate.currentSlug,
    query: candidate.gap.query,
    previousPosition: candidate.gap.avgPosition,
    newWordCount: article.wordCount,
    cost: article.cost,
  };
}
