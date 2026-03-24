#!/usr/bin/env npx tsx
/**
 * Create 6 test blog articles — one per template — to verify the blog system end-to-end.
 * Usage: npx tsx scripts/create-test-blog-articles.ts
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { BLOG_TEMPLATES } from "../src/lib/blog-templates";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262"; // HappySleep

const articles = [
  {
    name: "TEST: Bästa kudden 2026 — Bäst i test",
    templateId: "listicle",
    slug: "test-basta-kudden",
    blogCategory: "Produktguider",
    seoTitle: "Bästa kudden 2026 — Test & jämförelse | Hälsobladet",
    seoDescription: "Vi har testat de mest populära kuddarna. Här är vinnarna efter veckor av tester.",
  },
  {
    name: "TEST: Nacksmärta på natten — Orsaker och lösningar",
    templateId: "problem-solution",
    slug: "test-nacksmarta-natten",
    blogCategory: "Sömn & Hälsa",
    seoTitle: "Nacksmärta på natten — Orsaker & lösningar | Hälsobladet",
    seoDescription: "Vaknar du med ont i nacken? Här är de vanligaste orsakerna och vad du kan göra åt det.",
  },
  {
    name: "TEST: Hur väljer du rätt kollagentillskott?",
    templateId: "buying-guide",
    slug: "test-valja-kollagentillskott",
    blogCategory: "Guider",
    seoTitle: "Hur väljer du rätt kollagentillskott? Köpguide 2026 | Hälsobladet",
    seoDescription: "Komplett köpguide till kollagentillskott. Vad ska du titta på och vilka fallgropar bör du undvika?",
  },
  {
    name: "TEST: Flytande kollagen vs pulver — Vilken form är bäst?",
    templateId: "comparison",
    slug: "test-flytande-vs-pulver",
    blogCategory: "Jämförelser",
    seoTitle: "Flytande kollagen vs pulver — Vilken form är bäst? | Hälsobladet",
    seoDescription: "Vi jämför flytande kollagen med pulver. Upptäck skillnaderna i absorption, smak och pris.",
  },
  {
    name: "TEST: Funkar kollagentillskott? Vad säger forskningen",
    templateId: "science",
    slug: "test-funkar-kollagentillskott",
    blogCategory: "Forskning",
    seoTitle: "Funkar kollagentillskott? Vad forskningen visar | Hälsobladet",
    seoDescription: "En evidensbaserad genomgång av forskningen bakom kollagentillskott. Vad vet vi egentligen?",
  },
  {
    name: "TEST: Hur tvättar du din kudde — Komplett guide",
    templateId: "how-to",
    slug: "test-tvatta-kudde",
    blogCategory: "Guider",
    seoTitle: "Hur tvättar du din kudde? Steg-för-steg-guide | Hälsobladet",
    seoDescription: "Komplett guide till att tvätta din kudde rätt. Steg för steg, oavsett kuddtyp.",
  },
];

async function main() {
  console.log("Creating 6 test blog articles...\n");

  for (const article of articles) {
    const template = BLOG_TEMPLATES.find((t) => t.id === article.templateId);
    if (!template) {
      console.error(`Template not found: ${article.templateId}`);
      continue;
    }

    const html = template.getHtml(article.name);

    // Create the page
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .insert({
        name: article.name,
        slug: article.slug,
        product: "happysleep",
        page_type: "listicle",
        source_url: "",
        source_language: "sv",
        original_html: html,
        workspace_id: WORKSPACE_ID,
        content_type: "seo_blog",
        blog_category: article.blogCategory,
      })
      .select("id")
      .single();

    if (pageErr) {
      console.error(`Failed to create page "${article.name}":`, pageErr.message);
      continue;
    }

    // Create the Swedish translation
    const { error: transErr } = await supabase
      .from("translations")
      .upsert({
        page_id: page.id,
        language: "sv",
        variant: "control",
        slug: article.slug,
        translated_html: html,
        seo_title: article.seoTitle,
        seo_description: article.seoDescription,
        status: "draft",
        updated_at: new Date().toISOString(),
      }, { onConflict: "page_id,language,variant" });

    if (transErr) {
      console.error(`Failed to create translation for "${article.name}":`, transErr.message);
      continue;
    }

    console.log(`  ✓ ${article.templateId.padEnd(16)} → ${article.name}  (page ${page.id})`);
  }

  console.log("\nDone! All test articles created. Visit /pages?tab=blog to see them.");
}

main().catch(console.error);
