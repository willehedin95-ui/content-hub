import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { detectGapKeywords, addGapsToContentPlan } from "@/lib/gsc-gaps";
import type { Language } from "@/types";

// Weekly cron that converts GSC impressions/positions into content_plan
// entries so the autopilot discovers real search demand instead of only
// working from the hardcoded plan. Safe to run more often — all inserts
// are deduped against existing slugs + normalized keywords.

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Only workspaces that opted in to GSC-driven content discovery
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  const results: Array<{
    workspace: string;
    language: string;
    gapsFound: number;
    added: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    if (settings.gsc_gap_refresh_enabled === false) continue; // explicit opt-out

    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];
    const productSlug = (settings.default_product as string) || "happysleep";

    for (const lang of languages) {
      try {
        const gaps = await detectGapKeywords(ws.id as string, lang as Language, {
          windowDays: 30,
          minImpressions: (settings.gsc_gap_min_impressions as number) || 5,
          limit: (settings.gsc_gap_max_added_per_run as number) || 10,
        });

        const { added, skipped } = await addGapsToContentPlan(
          ws.id as string,
          lang as Language,
          gaps,
          productSlug
        );

        results.push({
          workspace: ws.slug as string,
          language: lang,
          gapsFound: gaps.length,
          added,
          skipped,
        });

        console.log(
          `[gsc-gap-refresh] ${ws.slug} (${lang}): ${gaps.length} gaps, ${added} added, ${skipped} skipped`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[gsc-gap-refresh] ${ws.slug} (${lang}) failed:`, message);
        results.push({
          workspace: ws.slug as string,
          language: lang,
          gapsFound: 0,
          added: 0,
          skipped: 0,
          error: message,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
