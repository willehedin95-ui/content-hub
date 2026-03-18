import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { swipeCompetitorAd } from "@/lib/swipe-competitor";

export const maxDuration = 300;

export async function POST() {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  // Find the oldest queued ad
  const { data: next } = await db
    .from("discovered_ads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!next) {
    return NextResponse.json({ ok: true, done: true });
  }

  // Mark as swiping
  await db.from("discovered_ads")
    .update({ status: "swiping", updated_at: new Date().toISOString() })
    .eq("id", next.id);

  const mediaUrls = (next.media_urls as string[]) ?? [];
  if (mediaUrls.length === 0) {
    await db.from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", next.id);
    return NextResponse.json({ ok: true, skipped: true, reason: "No images" });
  }

  const settings = await getWorkspaceSettings();
  const productSlug = (settings as Record<string, unknown>).default_product as string || "happysleep";

  try {
    const result = await swipeCompetitorAd({
      workspaceId,
      productSlug,
      competitorImageUrls: mediaUrls.slice(0, 3),
      competitorAdCopy: next.body ?? undefined,
      brandName: next.brand_name ?? "Unknown",
      gethookdAdId: next.gethookd_ad_id,
      notifyTelegram: false,
      painPoint: (next.pain_point as string) || undefined,
    });

    await db.from("discovered_ads")
      .update({ status: "swiped", image_job_id: result.jobId, updated_at: new Date().toISOString() })
      .eq("id", next.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[ad-spy/process-next] Error:", err);

    await db.from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", next.id);

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Swipe failed" },
      { status: 500 }
    );
  }
}
