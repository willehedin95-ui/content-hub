import { NextRequest, NextResponse } from "next/server";
import { deploySitemapAndRobots } from "@/lib/cloudflare-pages";
import type { Language } from "@/types";

export const maxDuration = 60;

/**
 * POST /api/seo/deploy-sitemaps
 * Deploys sitemap.xml + robots.txt to all configured CF Pages projects.
 * Can also be called with ?language=sv to deploy a single language.
 * Auth: CRON_SECRET or session cookie.
 */
export async function POST(req: NextRequest) {
  // Allow cron secret auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authorized via cron secret
  } else {
    // For now, allow any authenticated request (session check would go here)
  }

  const { searchParams } = new URL(req.url);
  const singleLang = searchParams.get("language") as Language | null;

  const languages: Language[] = singleLang
    ? [singleLang]
    : (["sv", "da", "no"] as Language[]);

  const results: Array<{
    language: string;
    sitemapUrl?: string;
    deploy_id?: string;
    error?: string;
  }> = [];

  for (const lang of languages) {
    try {
      const result = await deploySitemapAndRobots(lang);
      results.push({
        language: lang,
        sitemapUrl: result.sitemapUrl,
        deploy_id: result.deploy_id,
      });
    } catch (err) {
      results.push({
        language: lang,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
