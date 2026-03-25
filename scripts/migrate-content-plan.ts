/**
 * One-time migration: move hardcoded content plans into blog_content_plan table.
 * Also marks already-published articles as "published" with page_id linkage.
 *
 * Usage: npx tsx scripts/migrate-content-plan.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const value = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = value;
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262"; // HappySleep

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

// All content plans from blog-autopilot.ts (condensed)
const CONTENT_PLAN_SV: ContentPlanArticle[] = [
  { order: 1, slug: "basta-kudden", title: "Bästa kudden 2026 — Test av 11 kuddar", category: "Bäst i test", templateId: "listicle", primaryKeyword: "bästa kudden", secondaryKeywords: ["bästa kudden 2026", "kudde bäst i test"], wordCount: "4000-5000", contentBrief: "Comprehensive pillow review. Test 11 pillows. MONEY PAGE.", productSlug: "happysleep", internalLinkSlugs: ["kudde-for-sidosovare", "nacksmarta-pa-natten", "minnesskum-vs-latex-kudde"] },
  { order: 2, slug: "kudde-for-sidosovare", title: "Kudde för sidosovare — Guide & rekommendationer 2026", category: "Köpguider", templateId: "buying-guide", primaryKeyword: "kudde sidosovare", secondaryKeywords: ["bästa kudden för sidosovare", "sidosovarkudde"], wordCount: "2000-3000", contentBrief: "Buying guide for side sleepers.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "nacksmarta-pa-natten"] },
  { order: 3, slug: "nacksmarta-pa-natten", title: "Nacksmärta på natten — Orsaker & lösningar", category: "Sömnproblem", templateId: "problem-solution", primaryKeyword: "nacksmärta på natten", secondaryKeywords: ["nackvärk kudde", "ont i nacken sömn"], wordCount: "2000-3000", contentBrief: "Problem-solution article about night-time neck pain.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "kudde-for-sidosovare"] },
  { order: 4, slug: "minnesskum-vs-latex-kudde", title: "Minnesskum vs latex kudde — Vilken passar dig?", category: "Jämförelser", templateId: "comparison", primaryKeyword: "minnesskum kudde", secondaryKeywords: ["latex kudde", "minnesskum vs latex"], wordCount: "2000-2500", contentBrief: "Head-to-head comparison of memory foam vs latex pillows.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "kudde-for-sidosovare"] },
  { order: 5, slug: "hur-ofta-byta-kudde", title: "Hur ofta ska man byta kudde? (Expertguide 2026)", category: "Skötselguider", templateId: "problem-solution", primaryKeyword: "byta kudde hur ofta", secondaryKeywords: ["kudde livslängd", "när byta kudde"], wordCount: "1500-2000", contentBrief: "How often to replace pillows.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "tvatta-kudde"] },
  { order: 6, slug: "tvatta-kudde", title: "Tvätta kudde — Steg-för-steg-guide", category: "Skötselguider", templateId: "problem-solution", primaryKeyword: "tvätta kudde", secondaryKeywords: ["tvätta minnesskumskudde", "kudde tvättmaskin"], wordCount: "1500-2000", contentBrief: "How to wash different pillow types.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "hur-ofta-byta-kudde"] },
  { order: 7, slug: "somn-och-halsa", title: "Sömn och hälsa — Så påverkar sömnen din kropp 2026", category: "Forskning", templateId: "science", primaryKeyword: "sömn hälsa", secondaryKeywords: ["sömnbrist konsekvenser", "varför sömn är viktigt"], wordCount: "2500-3500", contentBrief: "Broad authority builder about sleep and health.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "sovstallningar"] },
  { order: 8, slug: "sovstallningar", title: "Sovställningar — Guide till hur du sover bäst 2026", category: "Sov Bättre", templateId: "problem-solution", primaryKeyword: "bästa sovställningen", secondaryKeywords: ["sova på sidan", "sovställning rygg"], wordCount: "2000-2500", contentBrief: "Guide to sleep positions.", productSlug: "happysleep", internalLinkSlugs: ["kudde-for-sidosovare", "basta-kudden"] },
  { order: 9, slug: "sluta-snarka", title: "Sluta snarka — 8 bevisade metoder som fungerar 2026", category: "Sömnproblem", templateId: "listicle", primaryKeyword: "sluta snarka", secondaryKeywords: ["bästa mot snarkning", "snarkning", "anti snark"], wordCount: "2500-3500", contentBrief: "Comprehensive anti-snoring guide.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "sovstallningar", "somn-och-halsa"] },
  { order: 10, slug: "ergonomisk-kudde-bast-i-test", title: "Ergonomisk kudde bäst i test 2026 — Test & guide", category: "Bäst i test", templateId: "buying-guide", primaryKeyword: "ergonomisk kudde bäst i test", secondaryKeywords: ["ergonomisk kudde", "nackstöd bäst i test"], wordCount: "3000-4000", contentBrief: "Focused buying guide for ergonomic/cervical pillows.", productSlug: "happysleep", internalLinkSlugs: ["basta-kudden", "nacksmarta-pa-natten", "kudde-for-sidosovare"] },
  // Hydro13 (deferred)
  { order: 11, slug: "kollagentillskott-guide", title: "Kollagentillskott — Komplett guide 2026", category: "Kollagen & Tillskott", templateId: "science", primaryKeyword: "kollagentillskott", secondaryKeywords: ["kollagen tillskott", "kollagen hud"], wordCount: "3000-4000", contentBrief: "Pillar article for all collagen content.", productSlug: "hydro13", internalLinkSlugs: ["basta-kollagentillskottet", "funkar-kollagentillskott"] },
  { order: 12, slug: "basta-kollagentillskottet", title: "Bästa kollagentillskottet 2026 — Test & jämförelse", category: "Bäst i test", templateId: "listicle", primaryKeyword: "bästa kollagentillskottet", secondaryKeywords: ["kollagen bäst i test"], wordCount: "3000-4000", contentBrief: "Review 6-8 collagen products. MONEY PAGE.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "funkar-kollagentillskott"] },
  { order: 13, slug: "funkar-kollagentillskott", title: "Funkar kollagentillskott? Vad forskningen visar", category: "Forskning", templateId: "science", primaryKeyword: "funkar kollagen", secondaryKeywords: ["kollagen forskning", "kollagen bluff"], wordCount: "2000-3000", contentBrief: "Skeptical angle → balanced review of research.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"] },
  { order: 14, slug: "flytande-kollagen-vs-pulver", title: "Flytande kollagen vs pulver vs kapslar — Vilken form är bäst?", category: "Jämförelser", templateId: "comparison", primaryKeyword: "flytande kollagen", secondaryKeywords: ["kollagen pulver", "kollagen kapslar"], wordCount: "2000-2500", contentBrief: "Format comparison: liquid vs powder vs capsule.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"] },
  { order: 15, slug: "kollagen-for-hud-rynkor", title: "Kollagen för hud & rynkor — Så fungerar det inifrån", category: "Hudvård inifrån", templateId: "problem-solution", primaryKeyword: "kollagen hud", secondaryKeywords: ["kollagen rynkor", "hudvård inifrån"], wordCount: "2000-3000", contentBrief: "How skin aging works and oral collagen peptides.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"] },
  { order: 16, slug: "somn-och-hudhalsa", title: "Sömn och hudhälsa — Varför skönhetssömn fungerar", category: "Hudvård inifrån", templateId: "science", primaryKeyword: "skönhetssömn", secondaryKeywords: ["sömn hud", "sömn rynkor"], wordCount: "2000-3000", contentBrief: "Bridge article between sleep + skin health.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kudden"] },
  { order: 17, slug: "kollagen-for-har-naglar", title: "Kollagen för hår & naglar — Fungerar det?", category: "Hår & Naglar", templateId: "problem-solution", primaryKeyword: "kollagen hår", secondaryKeywords: ["kollagen naglar", "tillskott för hår"], wordCount: "2000-2500", contentBrief: "Collagen for hair and nails.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"] },
  { order: 18, slug: "basta-kollagen-mot-rynkor", title: "Bästa kollagen mot rynkor 2026 — Test & jämförelse", category: "Bäst i test", templateId: "listicle", primaryKeyword: "bästa kollagen mot rynkor", secondaryKeywords: ["kollagen mot rynkor", "anti-aging kollagen"], wordCount: "2500-3500", contentBrief: "Product comparison for anti-wrinkle collagen. MONEY PAGE.", productSlug: "hydro13", internalLinkSlugs: ["kollagentillskott-guide", "basta-kollagentillskottet"] },
];

const CONTENT_PLAN_DA: ContentPlanArticle[] = [
  { order: 1, slug: "bedste-nakkepude", title: "Bedste nakkepude 2026 — Test af 11 puder", category: "Bedst i test", templateId: "listicle", primaryKeyword: "nakkepude", secondaryKeywords: ["bedste nakkepude", "nakkepuder"], wordCount: "4000-5000", contentBrief: "Comprehensive neck pillow review. MONEY PAGE.", productSlug: "happysleep", internalLinkSlugs: ["hovedpude-bedst-i-test", "ergonomisk-hovedpude"] },
  { order: 2, slug: "hovedpude-bedst-i-test", title: "Hovedpude bedst i test 2026 — Test & guide", category: "Bedst i test", templateId: "listicle", primaryKeyword: "hovedpude bedst i test", secondaryKeywords: ["bedste hovedpude test", "bedste hovedpude"], wordCount: "3000-4000", contentBrief: "Review of best head pillows in Denmark.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "memory-foam-pude"] },
  { order: 3, slug: "ergonomisk-hovedpude", title: "Ergonomisk hovedpude — Guide & anbefalinger 2026", category: "Købsguider", templateId: "buying-guide", primaryKeyword: "ergonomisk hovedpude", secondaryKeywords: ["hovedpude ergonomisk", "ergonomisk pude"], wordCount: "2500-3500", contentBrief: "Buying guide for ergonomic pillows.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "hovedpude-bedst-i-test"] },
  { order: 4, slug: "stop-snorken", title: "Stop snorken — 8 metoder der virker 2026", category: "Søvnproblemer", templateId: "listicle", primaryKeyword: "stop snorken", secondaryKeywords: ["snorken", "snorkeskinne"], wordCount: "2500-3500", contentBrief: "Comprehensive anti-snoring guide.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "sovestillinger"] },
  { order: 5, slug: "sovnloshed", title: "Søvnløshed — Årsager & løsninger 2026", category: "Søvnproblemer", templateId: "problem-solution", primaryKeyword: "søvnløshed", secondaryKeywords: ["søvnløshed overgangsalder", "søvnproblemer"], wordCount: "2500-3500", contentBrief: "Problem-solution about insomnia.", productSlug: "happysleep", internalLinkSlugs: ["bedre-sovn", "sovestillinger"] },
  { order: 6, slug: "bedre-sovn", title: "Sov bedre — 12 tips til bedre søvn 2026", category: "Sov Bedre", templateId: "listicle", primaryKeyword: "bedre søvn", secondaryKeywords: ["sov bedre", "sov bedre om natten"], wordCount: "2000-3000", contentBrief: "Practical sleep improvement guide.", productSlug: "happysleep", internalLinkSlugs: ["sovnloshed", "sovestillinger"] },
  { order: 7, slug: "memory-foam-pude", title: "Memory foam pude — Alt du skal vide 2026", category: "Sammenligninger", templateId: "comparison", primaryKeyword: "memory foam pude", secondaryKeywords: ["memory foam hovedpude", "memory foam vs latex"], wordCount: "2000-2500", contentBrief: "Memory foam vs latex pillow comparison.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "hovedpude-bedst-i-test"] },
  { order: 8, slug: "vask-af-hovedpude", title: "Vask af hovedpude — Trin-for-trin guide", category: "Plejeguider", templateId: "problem-solution", primaryKeyword: "vask af hovedpude", secondaryKeywords: ["vaske hovedpude", "rengøring af hovedpude"], wordCount: "1500-2000", contentBrief: "How to wash different pillow types.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "hovedpude-bedst-i-test"] },
  { order: 9, slug: "sovestillinger", title: "Sovestillinger — Guide til den bedste sovestilling 2026", category: "Sov Bedre", templateId: "problem-solution", primaryKeyword: "sovestilling", secondaryKeywords: ["sovestillinger", "sovestilling gravid"], wordCount: "2000-2500", contentBrief: "Guide to sleep positions.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "stop-snorken"] },
  { order: 10, slug: "sovn-og-sundhed", title: "Søvn og sundhed — Sådan påvirker søvn din krop 2026", category: "Forskning", templateId: "science", primaryKeyword: "søvn og sundhed", secondaryKeywords: ["søvn sundhed", "søvnmangel konsekvenser"], wordCount: "2500-3500", contentBrief: "Authority builder about sleep and health.", productSlug: "happysleep", internalLinkSlugs: ["bedste-nakkepude", "sovestillinger"] },
];

const CONTENT_PLAN_NO: ContentPlanArticle[] = [
  { order: 1, slug: "beste-nakkepute", title: "Beste nakkepute 2026 — Test av 11 puter", category: "Best i test", templateId: "listicle", primaryKeyword: "nakkepute", secondaryKeywords: ["beste nakkepute", "nakkeputer"], wordCount: "4000-5000", contentBrief: "Comprehensive neck pillow review. MONEY PAGE.", productSlug: "happysleep", internalLinkSlugs: ["ergonomisk-pute", "pute-for-vond-nakke"] },
  { order: 2, slug: "ergonomisk-pute", title: "Ergonomisk pute — Guide & anbefalinger 2026", category: "Kjopsguider", templateId: "buying-guide", primaryKeyword: "ergonomisk pute", secondaryKeywords: ["ergonomisk hodepute", "ergonomisk nakkepute"], wordCount: "2500-3500", contentBrief: "Buying guide for ergonomic pillows.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "pute-for-vond-nakke"] },
  { order: 3, slug: "snorking-behandling", title: "Snorking — 8 metoder som faktisk virker 2026", category: "Sovnproblemer", templateId: "listicle", primaryKeyword: "snorking", secondaryKeywords: ["snorkeskinne", "snorking behandling"], wordCount: "2500-3500", contentBrief: "Comprehensive anti-snoring guide.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "soveposisjoner"] },
  { order: 4, slug: "pute-for-vond-nakke", title: "Beste pute for vond nakke — Slik velger du riktig 2026", category: "Kjopsguider", templateId: "problem-solution", primaryKeyword: "beste pute for vond nakke", secondaryKeywords: ["pute for nakkesmerter", "beste hodepute for nakken"], wordCount: "2000-3000", contentBrief: "Choosing the right pillow for neck pain.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "ergonomisk-pute"] },
  { order: 5, slug: "hodepute-best-i-test", title: "Hodepute best i test 2026 — Test & guide", category: "Best i test", templateId: "listicle", primaryKeyword: "best i test hodepute", secondaryKeywords: ["hodepute best i test", "beste hodepute"], wordCount: "3000-4000", contentBrief: "Review of best head pillows in Norway.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "ergonomisk-pute"] },
  { order: 6, slug: "pute-for-sidesovere", title: "Pute for sidesovere — Guide & anbefalinger 2026", category: "Kjopsguider", templateId: "buying-guide", primaryKeyword: "pute for sidesovere", secondaryKeywords: ["sidesover pute", "beste pute for sidesovere"], wordCount: "2000-3000", contentBrief: "Buying guide for side sleepers.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "pute-for-vond-nakke"] },
  { order: 7, slug: "sovnloshet", title: "Søvnløshet — Årsaker og løsninger 2026", category: "Sovnproblemer", templateId: "problem-solution", primaryKeyword: "søvnløshet", secondaryKeywords: ["søvnproblemer", "kan ikke sove"], wordCount: "2500-3500", contentBrief: "Problem-solution about insomnia.", productSlug: "happysleep", internalLinkSlugs: ["sov-bedre", "soveposisjoner"] },
  { order: 8, slug: "sov-bedre", title: "Sov bedre — 12 tips for god søvn 2026", category: "Sov Bedre", templateId: "listicle", primaryKeyword: "sove bedre", secondaryKeywords: ["sov bedre", "god søvn"], wordCount: "2000-3000", contentBrief: "Practical sleep improvement guide.", productSlug: "happysleep", internalLinkSlugs: ["sovnloshet", "soveposisjoner"] },
  { order: 9, slug: "soveposisjoner", title: "Soveposisjoner — Guide til den beste sovepositsjonen 2026", category: "Sov Bedre", templateId: "problem-solution", primaryKeyword: "soveposisjon", secondaryKeywords: ["soveposisjoner", "sove på siden"], wordCount: "2000-2500", contentBrief: "Guide to sleep positions.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "snorking-behandling"] },
  { order: 10, slug: "sovn-og-helse", title: "Søvn og helse — Slik påvirker søvn kroppen din 2026", category: "Forskning", templateId: "science", primaryKeyword: "søvn og helse", secondaryKeywords: ["søvn helse", "søvnmangel konsekvenser"], wordCount: "2500-3500", contentBrief: "Authority builder about sleep and health.", productSlug: "happysleep", internalLinkSlugs: ["beste-nakkepute", "soveposisjoner"] },
];

const DEFERRED_PRODUCT_SLUGS = ["hydro13"];

async function main() {
  console.log("Migrating content plans to blog_content_plan table...\n");

  // Get already-published blog articles to mark them correctly
  const { data: publishedPages } = await supabase
    .from("pages")
    .select("id, slug, source_language")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("content_type", "seo_blog");

  const publishedMap = new Map<string, string>(); // "lang:slug" → page_id
  for (const p of publishedPages ?? []) {
    publishedMap.set(`${p.source_language}:${p.slug}`, p.id);
  }

  const plans: Record<string, ContentPlanArticle[]> = {
    sv: CONTENT_PLAN_SV,
    da: CONTENT_PLAN_DA,
    no: CONTENT_PLAN_NO,
  };

  let inserted = 0;
  let skipped = 0;

  for (const [lang, articles] of Object.entries(plans)) {
    for (const article of articles) {
      const key = `${lang}:${article.slug}`;
      const pageId = publishedMap.get(key);
      const isDeferred = DEFERRED_PRODUCT_SLUGS.includes(article.productSlug);

      let status: string;
      if (pageId) {
        status = "published";
      } else if (isDeferred) {
        status = "deferred";
      } else {
        status = "planned";
      }

      // Priority: lower order = higher priority (100 - order gives higher numbers to earlier articles)
      const priority = 100 - article.order;

      const { error } = await supabase.from("blog_content_plan").upsert(
        {
          workspace_id: WORKSPACE_ID,
          language: lang,
          slug: article.slug,
          title: article.title,
          category: article.category,
          template_id: article.templateId,
          primary_keyword: article.primaryKeyword,
          secondary_keywords: article.secondaryKeywords,
          word_count: article.wordCount,
          content_brief: article.contentBrief,
          product_slug: article.productSlug,
          internal_link_slugs: article.internalLinkSlugs,
          priority,
          status,
          source: "manual",
          page_id: pageId || null,
          published_at: pageId ? new Date().toISOString() : null,
        },
        { onConflict: "workspace_id,language,slug" }
      );

      if (error) {
        console.error(`  ERROR: ${key}: ${error.message}`);
      } else {
        inserted++;
        const statusIcon = status === "published" ? "✅" : status === "deferred" ? "⏸️" : "📝";
        console.log(`  ${statusIcon} ${lang.toUpperCase()} | ${article.slug} → ${status}`);
      }
    }
  }

  console.log(`\nDone! Inserted ${inserted} articles, skipped ${skipped}.`);

  // Summary
  const { data: summary } = await supabase
    .from("blog_content_plan")
    .select("language, status")
    .eq("workspace_id", WORKSPACE_ID);

  const counts: Record<string, Record<string, number>> = {};
  for (const row of summary ?? []) {
    counts[row.language] = counts[row.language] || {};
    counts[row.language][row.status] = (counts[row.language][row.status] || 0) + 1;
  }
  console.log("\nSummary by language:");
  for (const [lang, statuses] of Object.entries(counts)) {
    console.log(`  ${lang.toUpperCase()}: ${JSON.stringify(statuses)}`);
  }
}

main().catch(console.error);
