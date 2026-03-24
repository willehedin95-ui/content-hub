/**
 * Blog autopilot orchestrator.
 * Fully automated: keyword selection → article writing → publishing → notification.
 * No manual steps. Runs as a daily cron.
 */

import { createServerSupabase } from "./supabase-admin";
import { generateBlogArticle, type ArticleRequest } from "./blog-writer";
import {
  extractArticleBody,
  extractFirstImage,
  extractMetaDescription,
  autoFillAltText,
  wrapInBlogShell,
  getDefaultBlogConfig,
  slugifyCategory,
  type BlogConfig,
} from "./blog-shell";
import {
  publishPage,
  getProjectCustomDomain,
  deploySitemapAndRobots,
  type PageAnalyticsConfig,
} from "./cloudflare-pages";
import {
  getPublishedBlogArticles,
  deployBlogHomepage,
  deployBlogRssFeed,
} from "./blog-deploy";
import { sendTelegramNotification } from "./telegram";
import {
  isDataForSeoConfigured,
  getKeywordSuggestions,
} from "./dataforseo";
import { submitSitemap, isGscConfigured } from "./gsc";
import type { Language } from "@/types";

// ---------------------------------------------------------------------------
// Content plan — the first 15 articles (from BLOG-CONTENT-PLAN.md)
// ---------------------------------------------------------------------------

interface ContentPlanArticle {
  order: number;
  slug: string;
  title: string;
  category: string;
  templateId: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  wordCount: string;
  contentBrief: string;
  productSlug: string;
  internalLinkSlugs: string[];
}

// Collagen/Hydro13 articles are deferred until the Renew brand (get-renew.com)
// Shopify store is live. Currently only HappySleep articles are published.
// To re-enable collagen articles: remove the "deferred" flag below and update
// product URLs from SwedishBalance to get-renew.com.
const DEFERRED_PRODUCT_SLUGS = ["hydro13"];

const CONTENT_PLAN: ContentPlanArticle[] = [
  // =====================================================================
  // HappySleep articles (publish now) — orders 1-10
  // =====================================================================
  {
    order: 1,
    slug: "basta-kudden",
    title: "Bästa kudden 2026 — Test av 11 kuddar",
    category: "Bäst i test",
    templateId: "listicle",
    primaryKeyword: "bästa kudden",
    secondaryKeywords: ["bästa kudden 2026", "kudde bäst i test"],
    wordCount: "4000-5000",
    contentBrief: `Comprehensive pillow review. Test 11 pillows: HappySleep (our product, top pick), Tempur Original, IKEA KLUBBSPORRE, Dunlopillo Serenity, Pillowise, Sissel Soft, Curaprox, IKEA ROSENSKÄRM, Bäddmadrassen Original, Casper Original Pillow, Emma Diamond Degree. Compare by sleep position (sido/rygg/mage), material (minnesskum/latex/polyester), firmness, price. Ranking table with scores. HappySleep wins for ergonomic design and value. Be honest about competitors — praise where deserved, note weaknesses. MONEY PAGE. Include buying guide section about choosing right pillow for your sleep position. USE ONLY the verified competitor products from the system prompt — NEVER invent products.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["kudde-for-sidosovare", "nacksmarta-pa-natten", "minnesskum-vs-latex-kudde"],
  },
  {
    order: 2,
    slug: "kudde-for-sidosovare",
    title: "Kudde för sidosovare — Guide & rekommendationer 2026",
    category: "Köpguider",
    templateId: "buying-guide",
    primaryKeyword: "kudde sidosovare",
    secondaryKeywords: ["bästa kudden för sidosovare", "sidosovarkudde"],
    wordCount: "2000-3000",
    contentBrief: `Buying guide for side sleepers. What makes a good side-sleeper pillow (height, firmness, neck alignment). Common mistakes. Recommend specific pillows. Include section on how pillow height relates to shoulder width. Link to 1177.se for neck health.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "nacksmarta-pa-natten"],
  },
  {
    order: 3,
    slug: "nacksmarta-pa-natten",
    title: "Nacksmärta på natten — Orsaker & lösningar",
    category: "Sömnproblem",
    templateId: "problem-solution",
    primaryKeyword: "nacksmärta på natten",
    secondaryKeywords: ["nackvärk kudde", "ont i nacken sömn"],
    wordCount: "2000-3000",
    contentBrief: `Problem-solution article about night-time neck pain. Causes: wrong pillow, sleep position, tension. Research on cervical spine alignment during sleep. Concrete solutions: pillow selection, stretches, sleep position adjustments. When to see a doctor (1177.se reference). HappySleep as solution for neck alignment.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "kudde-for-sidosovare"],
  },
  {
    order: 4,
    slug: "minnesskum-vs-latex-kudde",
    title: "Minnesskum vs latex kudde — Vilken passar dig?",
    category: "Jämförelser",
    templateId: "comparison",
    primaryKeyword: "minnesskum kudde",
    secondaryKeywords: ["latex kudde", "minnesskum vs latex"],
    wordCount: "2000-2500",
    contentBrief: `Head-to-head comparison of memory foam vs latex pillows. Material properties, heat retention, durability, support, price. Comparison table. Memory foam: body-conforming but heat-retaining. Latex: responsive but firmer. Guide on which to choose based on sleep style and preferences.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "kudde-for-sidosovare"],
  },
  {
    order: 5,
    slug: "hur-ofta-byta-kudde",
    title: "Hur ofta ska man byta kudde? (Expertguide 2026)",
    category: "Skötselguider",
    templateId: "problem-solution",
    primaryKeyword: "byta kudde hur ofta",
    secondaryKeywords: ["kudde livslängd", "när byta kudde"],
    wordCount: "1500-2000",
    contentBrief: `How often to replace pillows (general: 1-2 years, memory foam: 2-3 years). Signs it's time: lumps, flat spots, neck pain, allergies worse. Hygiene angle: dust mites, sweat absorption. Quick test: fold the pillow in half — if it doesn't spring back, replace it.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "tvatta-kudde"],
  },
  {
    order: 6,
    slug: "tvatta-kudde",
    title: "Tvätta kudde — Steg-för-steg-guide",
    category: "Skötselguider",
    templateId: "problem-solution",
    primaryKeyword: "tvätta kudde",
    secondaryKeywords: ["tvätta minnesskumskudde", "kudde tvättmaskin"],
    wordCount: "1500-2000",
    contentBrief: `How to wash different pillow types: down, synthetic, memory foam. Step-by-step for each type. Machine wash settings, drying tips. Why memory foam should never go in the washing machine. How often to wash. Pillow protectors.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "hur-ofta-byta-kudde"],
  },
  {
    order: 7,
    slug: "somn-och-halsa",
    title: "Sömn och hälsa — Så påverkar sömnen din kropp 2026",
    category: "Forskning",
    templateId: "science",
    primaryKeyword: "sömn hälsa",
    secondaryKeywords: ["sömnbrist konsekvenser", "varför sömn är viktigt"],
    wordCount: "2500-3500",
    contentBrief: `Broad authority builder about sleep and health. How sleep affects immune system, mental health, weight, skin, cognitive function. Include section on how sleep affects skin/collagen production (bridges both product verticals). Cite Matthew Walker's "Why We Sleep" research, Swedish sleep studies. Bridge article connecting sleep and skin health.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "sovstallningar"],
  },
  {
    order: 8,
    slug: "sovstallningar",
    title: "Sovställningar — Guide till hur du sover bäst 2026",
    category: "Sov Bättre",
    templateId: "problem-solution",
    primaryKeyword: "bästa sovställningen",
    secondaryKeywords: ["sova på sidan", "sovställning rygg"],
    wordCount: "2000-2500",
    contentBrief: `Guide to sleep positions. Side sleeping (most common, best for most), back sleeping (good for spine, bad for snoring), stomach sleeping (worst for neck). How each position affects neck, back, and breathing. Pillow recommendations for each position. Connection to pillow choice.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["kudde-for-sidosovare", "basta-kudden"],
  },
  {
    order: 9,
    slug: "sluta-snarka",
    title: "Sluta snarka — 8 bevisade metoder som fungerar 2026",
    category: "Sömnproblem",
    templateId: "listicle",
    primaryKeyword: "sluta snarka",
    secondaryKeywords: ["bästa mot snarkning", "snarkning", "anti snark", "snarkningslösningar"],
    wordCount: "2500-3500",
    contentBrief: `Comprehensive anti-snoring guide. Cover: why people snore (soft palate, tongue position, nasal congestion, weight, alcohol), when snoring is dangerous (sleep apnea signs — refer to 1177.se). 8 methods ranked by evidence: sleep position change (side sleeping), pillow elevation, weight management, nasal strips/sprays, mouth exercises (myofunctional therapy), humidifier, anti-snore devices, when to see a doctor. Section on how pillow height/angle affects airway — natural HappySleep product placement. Studies: Ravesloot et al. 2013 on positional therapy. Include partner impact section (Swedish couples data). This is a HIGH-SPEND Google Ads keyword cluster (~15K SEK/mo).`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "sovstallningar", "somn-och-halsa"],
  },
  {
    order: 10,
    slug: "ergonomisk-kudde-bast-i-test",
    title: "Ergonomisk kudde bäst i test 2026 — Test & guide",
    category: "Bäst i test",
    templateId: "buying-guide",
    primaryKeyword: "ergonomisk kudde bäst i test",
    secondaryKeywords: ["ergonomisk kudde", "nackstöd bäst i test", "nackkudde bäst i test", "bästa ergonomiska kudden"],
    wordCount: "3000-4000",
    contentBrief: `Focused buying guide specifically for ergonomic/cervical pillows — different angle than the general "bästa kudden" article. What makes a pillow ergonomic: contoured design, cervical support curve, height zones for different sleep positions. Medical perspective: cervical lordosis support, pressure distribution, alignment (cite physiotherapy sources). Test these ergonomic pillows: HappySleep (our product, top pick), Tempur Original, Pillowise, Sissel Soft, Curaprox, Dunlopillo Serenity. Compare: contour shape, height adjustability, material, firmness, washability. Include section on who needs an ergonomic pillow (neck pain sufferers, office workers). HappySleep as top pick. USE ONLY verified competitor products from the system prompt. Link to 1177.se for chronic neck issues.`,
    productSlug: "happysleep",
    internalLinkSlugs: ["basta-kudden", "nacksmarta-pa-natten", "kudde-for-sidosovare"],
  },

  // =====================================================================
  // Collagen/Hydro13 articles (DEFERRED until Renew brand is live)
  // Orders 11-18 — skipped by pickNextArticle() while hydro13 is deferred
  // =====================================================================
  {
    order: 11,
    slug: "kollagentillskott-guide",
    title: "Kollagentillskott — Komplett guide 2026",
    category: "Kollagen & Tillskott",
    templateId: "science",
    primaryKeyword: "kollagentillskott",
    secondaryKeywords: ["kollagen tillskott", "kollagen hud", "kollagen supplement"],
    wordCount: "3000-4000",
    contentBrief: `Pillar article for all collagen content. What collagen is, types (I, II, III), how supplements work (bioactive peptide signaling — Pro-Hyp, Hyp-Gly), formats (liquid vs powder vs capsule), dosing (why 10,000+ mg matters), what to look for, realistic timeline for results. This is the main hub page — everything collagen links back here. YMYL: Cite Proksch et al. 2014, Hexsel et al. 2017. Use "studies suggest", "users report". Acknowledge EFSA hasn't approved collagen claims yet. Link to 1177.se for general skin health.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["basta-kollagentillskottet", "funkar-kollagentillskott", "flytande-kollagen-vs-pulver", "kollagen-for-hud-rynkor"],
  },
  {
    order: 12,
    slug: "basta-kollagentillskottet",
    title: "Bästa kollagentillskottet 2026 — Test & jämförelse",
    category: "Bäst i test",
    templateId: "listicle",
    primaryKeyword: "bästa kollagentillskottet",
    secondaryKeywords: ["kollagen bäst i test", "kollagentillskott test"],
    wordCount: "3000-4000",
    contentBrief: `Review 6-8 collagen products: Hydro13, Oslo Skin Lab, Källa, Biosalma, Elexir Pharma, Great Earth. Compare dosage, format, ingredients, price per day. Ranking table. MONEY PAGE — Hydro13 wins on dosage (12,500 mg vs competitors' 2,000-5,000 mg), format (liquid = higher absorption), and completeness (13+ active ingredients vs collagen alone).`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "funkar-kollagentillskott"],
  },
  {
    order: 13,
    slug: "funkar-kollagentillskott",
    title: "Funkar kollagentillskott? Vad forskningen visar",
    category: "Forskning",
    templateId: "science",
    primaryKeyword: "funkar kollagen",
    secondaryKeywords: ["kollagen forskning", "kollagen bluff", "kollagentillskott effekt"],
    wordCount: "2000-3000",
    contentBrief: `Skeptical angle → balanced review of actual peer-reviewed studies → what works and what doesn't → dosing matters → conclusion. Captures skeptic search traffic. Many Swedish women have tried cheap collagen and seen zero results — validate their experience, explain WHY it failed (underdosed, wrong format), then show what science says about clinical dosing.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"],
  },
  {
    order: 14,
    slug: "flytande-kollagen-vs-pulver",
    title: "Flytande kollagen vs pulver vs kapslar — Vilken form är bäst?",
    category: "Jämförelser",
    templateId: "comparison",
    primaryKeyword: "flytande kollagen",
    secondaryKeywords: ["kollagen pulver", "kollagen kapslar", "kollagen absorption"],
    wordCount: "2000-2500",
    contentBrief: `Head-to-head format comparison. Bioavailability (liquid ~90% vs tablets 20-30%), convenience, taste, dosing precision, price. Comparison table with pros/cons for each format.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"],
  },
  {
    order: 15,
    slug: "kollagen-for-hud-rynkor",
    title: "Kollagen för hud & rynkor — Så fungerar det inifrån",
    category: "Hudvård inifrån",
    templateId: "problem-solution",
    primaryKeyword: "kollagen hud",
    secondaryKeywords: ["kollagen rynkor", "hudvård inifrån", "kollagen anti-aging"],
    wordCount: "2000-3000",
    contentBrief: `How skin aging works (collagen loss ~1%/year after 25), why topical creams aren't enough, how oral collagen peptides signal fibroblasts, realistic timeline (4-8 weeks hydration, 3-6 months wrinkle reduction), what to combine with (vitamin C, hyaluronic acid — both in Hydro13).`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet", "funkar-kollagentillskott"],
  },
  {
    order: 16,
    slug: "somn-och-hudhalsa",
    title: "Sömn och hudhälsa — Varför skönhetssömn fungerar",
    category: "Hudvård inifrån",
    templateId: "science",
    primaryKeyword: "skönhetssömn",
    secondaryKeywords: ["sömn hud", "sömn rynkor", "sova bättre hud"],
    wordCount: "2000-3000",
    contentBrief: `Perfect bridge article between both products. How sleep quality directly affects skin health: growth hormone release during deep sleep, cortisol/collagen degradation from poor sleep, skin barrier repair overnight. The complete approach: good sleep (HappySleep pillow) + collagen supplement (Hydro13) = maximum results.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kudden", "kollagen-for-hud-rynkor"],
  },
  {
    order: 17,
    slug: "kollagen-for-har-naglar",
    title: "Kollagen för hår & naglar — Fungerar det?",
    category: "Hår & Naglar",
    templateId: "problem-solution",
    primaryKeyword: "kollagen hår",
    secondaryKeywords: ["kollagen naglar", "tillskott för hår", "biotin kollagen"],
    wordCount: "2000-2500",
    contentBrief: `Secondary Hydro13 angle for hair and nails. Scientific evidence for collagen's effect on hair thickness and nail strength. Hexsel et al. 2017 nail study. Proline/glycine as building blocks for keratin. Realistic timeline (2-3 months for nails, 3-6 months for hair). Why Hydro13's formula includes biotin + zinc alongside collagen.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"],
  },
  {
    order: 18,
    slug: "basta-kollagen-mot-rynkor",
    title: "Bästa kollagen mot rynkor 2026 — Test & jämförelse",
    category: "Bäst i test",
    templateId: "listicle",
    primaryKeyword: "bästa kollagen mot rynkor",
    secondaryKeywords: ["kollagen mot rynkor", "kollagentillskott rynkor", "anti-aging kollagen", "kollagen ansikte"],
    wordCount: "2500-3500",
    contentBrief: `Buyer-intent money page specifically about collagen for wrinkles. Different from the general "kollagen hud" science article — this is a product comparison focused on anti-wrinkle results. Review 6-8 products: Hydro13, Oslo Skin Lab, Källa, Biosalma, Elexir Pharma, Medic Collagen. Compare: collagen dosage, peptide type (hydrolyzed marine vs bovine), supporting ingredients for skin (vitamin C, hyaluronic acid, zinc), clinical evidence per product, price per month. Why Hydro13 wins: 12,500mg marine collagen + hyaluronic acid + vitamin C + 10 more ingredients in ONE liquid shot. Studies: Proksch et al. 2014, Borumand & Sibilla 2015. MONEY PAGE. ~22K SEK/mo Google Ads spend on this keyword.`,
    productSlug: "hydro13",
    internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet", "kollagen-for-hud-rynkor"],
  },
];

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

interface AutopilotResult {
  action: "published" | "skipped" | "error";
  message: string;
  slug?: string;
  url?: string;
}

/**
 * Run one cycle of the blog autopilot.
 * Returns what happened (published/skipped/error).
 */
export async function runBlogAutopilot(
  workspaceId: string,
  language: Language = "sv",
  opts?: { force?: boolean }
): Promise<AutopilotResult> {
  const db = createServerSupabase();

  // Check rate: max 1 article per day (skip with force)
  if (!opts?.force) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await db
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("content_type", "seo_blog")
      .gte("created_at", oneDayAgo);

    if ((recentCount ?? 0) >= 1) {
      return {
        action: "skipped",
        message: "Already published a blog article today. Max 1/day.",
      };
    }
  }

  // Find next article to write
  const nextArticle = await pickNextArticle(db, workspaceId, language);
  if (!nextArticle) {
    return {
      action: "skipped",
      message: "No articles to write. Content plan complete and no new keyword opportunities found.",
    };
  }

  // Get blog domain
  const blogDomain = getProjectCustomDomain(language);
  if (!blogDomain) {
    return {
      action: "error",
      message: `No blog domain configured for language: ${language}`,
    };
  }

  console.log(`[blog-autopilot] Writing article: "${nextArticle.title}" (${nextArticle.slug})`);

  // Generate the article
  let article;
  try {
    article = await generateBlogArticle({
      ...nextArticle,
      language,
      blogDomain,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Article generation failed";
    console.error("[blog-autopilot] Generation failed:", msg);
    return { action: "error", message: `Article generation failed: ${msg}` };
  }

  console.log(`[blog-autopilot] Generated ${article.wordCount} words, cost: $${article.cost.toFixed(4)}`);

  // Generate native-style editorial images for the article
  let finalHtml = article.html;
  let imageCost = 0;
  let imageCount = 0;
  try {
    const { generateBlogImages, replacePlaceholderImages, injectProductImage } = await import("./blog-images");
    const imageResult = await generateBlogImages({
      articleTitle: article.seoTitle,
      primaryKeyword: nextArticle.primaryKeyword,
      contentBrief: nextArticle.contentBrief,
      category: nextArticle.category,
      articleHtml: article.html,
      slug: nextArticle.slug,
      productSlug: nextArticle.productSlug,
    });
    if (imageResult.generated > 0) {
      finalHtml = replacePlaceholderImages(article.html, imageResult.urlMap);
      imageCost = imageResult.costUsd;
      imageCount = imageResult.generated;
      console.log(`[blog-autopilot] Generated ${imageCount} images, cost: $${imageCost.toFixed(3)}`);
    }
    // Inject real product photo from product bank before the CTA box
    finalHtml = await injectProductImage(finalHtml, nextArticle.productSlug);
  } catch (err) {
    console.warn("[blog-autopilot] Image generation failed, publishing with placeholders:", err);
  }

  // Create page record
  const { data: page, error: pageError } = await db
    .from("pages")
    .insert({
      name: nextArticle.title,
      slug: nextArticle.slug,
      product: nextArticle.productSlug,
      page_type: "blog",
      source_url: "",
      original_html: finalHtml,
      source_language: language,
      workspace_id: workspaceId,
      content_type: "seo_blog",
      blog_category: nextArticle.category,
      blog_featured_image_url: extractFirstImage(finalHtml) || null,
    })
    .select("id")
    .single();

  if (pageError || !page) {
    console.error("[blog-autopilot] Failed to create page:", pageError);
    return { action: "error", message: `DB error creating page: ${pageError?.message}` };
  }

  // Create translation record
  const { data: translation, error: transError } = await db
    .from("translations")
    .insert({
      page_id: page.id,
      language,
      slug: nextArticle.slug,
      seo_title: article.seoTitle,
      seo_description: article.seoDescription,
      translated_html: finalHtml,
      status: "draft",
    })
    .select("id, created_at")
    .single();

  if (transError || !translation) {
    console.error("[blog-autopilot] Failed to create translation:", transError);
    return { action: "error", message: `DB error creating translation: ${transError?.message}` };
  }

  // Publish directly (no cookie context needed)
  let publishUrl: string;
  try {
    publishUrl = await publishBlogArticle(
      finalHtml,
      nextArticle.slug,
      nextArticle.category,
      article.seoTitle,
      article.seoDescription,
      language,
      workspaceId,
      translation.id,
      translation.created_at,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    console.error("[blog-autopilot] Publish failed:", msg);
    // Update translation status to error
    await db
      .from("translations")
      .update({ status: "error", publish_error: msg })
      .eq("id", translation.id);
    return { action: "error", message: `Publish failed: ${msg}` };
  }

  // Update translation status
  await db
    .from("translations")
    .update({
      status: "published",
      published_url: publishUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", translation.id);

  // Log cost (article generation only — images logged separately in blog-images.ts)
  await db.from("usage_logs").insert({
    type: "blog_autopilot",
    model: "claude-sonnet",
    cost_usd: article.cost,
    metadata: {
      slug: nextArticle.slug,
      word_count: article.wordCount,
      images_generated: imageCount,
      image_cost_usd: imageCost,
      source: CONTENT_PLAN.some((p) => p.slug === nextArticle.slug) ? "content_plan" : "keyword_research",
    },
  });

  // Fire-and-forget: homepage, RSS, sitemap + GSC submission
  deployBlogHomepage(language).catch((err) =>
    console.warn("[blog-autopilot] Homepage deploy failed:", err)
  );
  deployBlogRssFeed(language).catch((err) =>
    console.warn("[blog-autopilot] RSS deploy failed:", err)
  );
  deploySitemapAndRobots(language)
    .then(() => {
      // Submit sitemap to Google Search Console so Google discovers new pages faster
      if (isGscConfigured()) {
        const domain = getProjectCustomDomain(language);
        if (domain) {
          const sitemapUrl = `https://${domain}/sitemap.xml`;
          const property = `sc-domain:${domain}`;
          submitSitemap(property, sitemapUrl).catch((err) =>
            console.warn("[blog-autopilot] GSC sitemap submit failed:", err)
          );
        }
      }
    })
    .catch((err) =>
      console.warn("[blog-autopilot] Sitemap deploy failed:", err)
    );

  // Send Telegram notification
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const totalCost = article.cost + imageCost;
      await sendTelegramNotification(
        chatId,
        `📝 *Blog article published*\n\n` +
          `*${escTg(article.seoTitle)}*\n` +
          `Category: ${escTg(nextArticle.category)}\n` +
          `Words: ${article.wordCount}\n` +
          `Images: ${imageCount}\n` +
          `Cost: $${totalCost.toFixed(4)}\n\n` +
          `[Read article](${publishUrl})`
      );
    }
  } catch {
    // Non-critical — don't fail the whole operation
    console.warn("[blog-autopilot] Telegram notification failed");
  }

  console.log(`[blog-autopilot] Published: ${publishUrl}`);
  return {
    action: "published",
    message: `Published "${article.seoTitle}" (${article.wordCount} words)`,
    slug: nextArticle.slug,
    url: publishUrl,
  };
}

// ---------------------------------------------------------------------------
// Article selection
// ---------------------------------------------------------------------------

async function pickNextArticle(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: Language
): Promise<ArticleRequest | null> {
  // Get existing blog slugs
  const { data: existingPages } = await db
    .from("pages")
    .select("slug")
    .eq("workspace_id", workspaceId)
    .eq("content_type", "seo_blog");

  const existingSlugs = new Set((existingPages ?? []).map((p) => p.slug));

  // First: try the content plan (ordered, skipping deferred products)
  for (const planned of CONTENT_PLAN) {
    if (DEFERRED_PRODUCT_SLUGS.includes(planned.productSlug)) continue;
    if (!existingSlugs.has(planned.slug)) {
      const blogDomain = getProjectCustomDomain(language) || "";
      return {
        title: planned.title,
        slug: planned.slug,
        category: planned.category,
        templateId: planned.templateId,
        primaryKeyword: planned.primaryKeyword,
        secondaryKeywords: planned.secondaryKeywords,
        wordCount: planned.wordCount,
        contentBrief: planned.contentBrief,
        productSlug: planned.productSlug,
        internalLinkSlugs: planned.internalLinkSlugs,
        language,
        blogDomain,
      };
    }
  }

  // Content plan complete — use DataForSEO to find new opportunities
  if (!isDataForSeoConfigured()) {
    return null;
  }

  try {
    const market = language === "sv" ? "SE" : language === "da" ? "DK" : "NO";
    const seeds =
      language === "sv"
        ? ["sömn tips", "bästa kudden", "kollagen hud", "sömnproblem"]
        : language === "da"
          ? ["bedste pude", "kollagen tilskud", "søvn tips"]
          : ["beste pute", "kollagen tilskudd", "søvn tips"];

    const { suggestions } = await getKeywordSuggestions(seeds, market);

    // Filter: volume > 200, competition index < 50, not already covered
    const candidates = suggestions
      .filter(
        (s) =>
          (s.searchVolume ?? 0) > 200 &&
          (s.competitionIndex ?? 100) < 50 &&
          !existingSlugs.has(slugifyKeyword(s.keyword))
      )
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, 1);

    if (!candidates.length) return null;

    const kw = candidates[0];
    const slug = slugifyKeyword(kw.keyword);
    const isCollagen = /kollagen|collagen|hud|hår|naglar|skönhet/i.test(kw.keyword);
    const isSleep = /sömn|kudde|pude|søvn|nacke|nack|rygg/i.test(kw.keyword);

    const blogDomain = getProjectCustomDomain(language) || "";
    return {
      title: capitalizeFirst(kw.keyword) + " 2026",
      slug,
      category: isCollagen ? "Hälsa" : isSleep ? "Sov Bättre" : "Hälsa",
      templateId: "problem-solution",
      primaryKeyword: kw.keyword,
      secondaryKeywords: [],
      wordCount: "2000-3000",
      contentBrief: `Write a comprehensive article about "${kw.keyword}". This keyword has ${kw.searchVolume} monthly searches with ${kw.competition || "unknown"} competition. Cover the topic thoroughly with practical advice, scientific backing, and product recommendations where relevant.`,
      productSlug: isCollagen ? "hydro13" : "happysleep",
      internalLinkSlugs: [
        isCollagen ? "kollagentillskott-guide" : "basta-kudden",
      ],
      language,
      blogDomain,
    };
  } catch (err) {
    console.warn("[blog-autopilot] DataForSEO keyword lookup failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Direct publish (bypasses cookie-based API route)
// ---------------------------------------------------------------------------

async function publishBlogArticle(
  articleHtml: string,
  slug: string,
  category: string,
  seoTitle: string,
  seoDescription: string,
  language: Language,
  workspaceId: string,
  translationId: string,
  createdAt: string
): Promise<string> {
  const db = createServerSupabase();

  // Get workspace settings for analytics
  const { data: workspace } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();

  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
  const domain = getProjectCustomDomain(language);
  const baseUrl = domain ? `https://${domain}` : "";

  // Extract and wrap in blog shell
  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(articleHtml);
  const bodyHtml = autoFillAltText(rawBodyHtml, seoTitle);
  const relatedArticles = await getPublishedBlogArticles(language, slug);
  const featuredImage = extractFirstImage(bodyHtml);

  const categorySlug = slugifyCategory(category);
  const deploySlug = categorySlug ? `${categorySlug}/${slug}` : slug;

  const wrappedHtml = wrapInBlogShell({
    articleBodyHtml: bodyHtml,
    articleHeadHtml: headHtml,
    seoTitle,
    seoDescription: seoDescription || extractMetaDescription(bodyHtml),
    slug,
    language,
    blogConfig,
    relatedArticles,
    featuredImageUrl: featuredImage,
    blogCategory: category,
    publishedAt: createdAt,
    updatedAt: new Date().toISOString(),
    baseUrl,
  });

  // Build analytics config
  const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
  const excludedIps = (settings.excluded_ips as string[]) ?? [];
  const analytics: PageAnalyticsConfig = {
    ga4MeasurementId: ga4Ids[language] || undefined,
    clarityProjectId:
      (settings.clarity_project_ids as Record<string, string>)?.[language] ||
      (settings.clarity_project_id as string) ||
      undefined,
    shopifyDomains: ((settings.shopify_domains as string) || "")
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean),
    metaPixelId: (settings.meta_pixel_id as string) || undefined,
    hubUrl: process.env.APP_URL || undefined,
    excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
    contentType: "seo_blog",
  };

  // Deploy to Cloudflare Pages
  const result = await publishPage(wrappedHtml, deploySlug, language, [], undefined, analytics);
  return result.url.trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Escape special Markdown characters for Telegram */
function escTg(s: string): string {
  return s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
