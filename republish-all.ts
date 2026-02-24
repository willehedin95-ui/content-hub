/**
 * Re-publish all published translations to update GA4 tracking code.
 * Run: npx tsx republish-all.ts
 */
import * as fs from "fs";

// Load .env.local BEFORE any other imports (they read env at module level)
const envContent = fs.readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.includes("=")) continue;
  const eqIdx = line.indexOf("=");
  const key = line.substring(0, eqIdx).trim();
  let val = line.substring(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = process.env[key] || val;
}

async function republishAll() {
  // Dynamic imports after env is loaded
  const { createClient } = await import("@supabase/supabase-js");
  const { publishPage } = await import("./src/lib/cloudflare-pages");
  type PageAnalyticsConfig = import("./src/lib/cloudflare-pages").PageAnalyticsConfig;
  const { optimizeImages } = await import("./src/lib/image-optimizer");
  const { replaceImageUrls } = await import("./src/lib/html-image-replacer");
  type Language = import("./src/types").Language;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(supabaseUrl, supabaseKey);
  // Get all published translations
  const { data: translations, error } = await db
    .from("translations")
    .select("id, language, slug, published_url, translated_html, pages(slug)")
    .eq("status", "published");

  if (error) {
    console.error("Failed to fetch translations:", error.message);
    return;
  }

  console.log(`Found ${translations.length} published translations to republish.\n`);

  // Get analytics settings
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const appSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const ga4Ids = (appSettings.ga4_measurement_ids as Record<string, string>) ?? {};

  for (const t of translations) {
    const slug = t.slug || (t.pages as any)?.slug;
    const language = t.language as Language;
    console.log(`[${language}] Republishing /${slug}...`);

    if (!t.translated_html) {
      console.log(`  ⚠ No HTML, skipping`);
      continue;
    }

    try {
      let html = t.translated_html as string;

      // Same cleanup as the publish route
      html = html.replace(/font-display:\s*optional/g, "font-display: swap");
      html = html.replace(/<style[^>]*data-cc-exclude-mode[^>]*>[\s\S]*?<\/style>/gi, "");
      html = html.replace(/ data-cc-padded(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-pad-skip(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-editable(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-hidden(?:="[^"]*")?/g, "");
      html = html.replace(/ contenteditable="[^"]*"/g, "");

      // Strip all tracking scripts to avoid duplicates (will be re-injected by publishPage)
      html = html.replace(/<!-- GA4 -->[\s\S]*?<\/script>(\s*<script>[\s\S]*?<\/script>)?/g, "");
      html = html.replace(/<script[^>]*data-cc-ga4[^>]*>[\s\S]*?<\/script>/g, "");
      html = html.replace(/<script[^>]*data-cc-optout[^>]*>[\s\S]*?<\/script>/g, "");
      html = html.replace(/<!-- Meta Pixel -->[\s\S]*?<\/script>/g, "");
      html = html.replace(/<script[^>]*data-cc-fbpixel[^>]*>[\s\S]*?<\/script>/g, "");
      html = html.replace(/<!-- Clarity -->[\s\S]*?<\/script>/g, "");
      html = html.replace(/<script[^>]*data-cc-clarity[^>]*>[\s\S]*?<\/script>/g, "");

      // Optimize images
      const imageResult = await optimizeImages(html, slug, () => {});
      if (imageResult.urlMap.size > 0) {
        html = replaceImageUrls(html, imageResult.urlMap);
      }
      const additionalFiles = imageResult.images.map((img) => ({
        path: img.deployPath,
        sha1: img.sha1,
        body: img.buffer,
      }));

      const excludedIps = (appSettings.excluded_ips as string[]) ?? [];
      const analytics: PageAnalyticsConfig = {
        ga4MeasurementId: ga4Ids[language] || undefined,
        clarityProjectId: (appSettings.clarity_project_id as string) || undefined,
        shopifyDomains: ((appSettings.shopify_domains as string) || "")
          .split(",")
          .map((d: string) => d.trim())
          .filter(Boolean),
        metaPixelId: (appSettings.meta_pixel_id as string) || undefined,
        hubUrl: process.env.APP_URL || undefined,
        excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
      };

      const result = await publishPage(html, slug, language, additionalFiles, () => {}, analytics);
      console.log(`  ✓ Published: ${result.url}`);
    } catch (err) {
      console.error(`  ✗ Failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\nDone!");
}

republishAll();
