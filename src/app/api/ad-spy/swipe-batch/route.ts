import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 300;

interface BatchAd {
  gethookd_ad_id: number;
  media_urls: string[];
  title?: string;
  body?: string;
  brand_name: string;
}

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  const { ads, pain_point, board_name, swipe_mode } = (await req.json()) as { ads: BatchAd[]; pain_point?: string; board_name?: string; swipe_mode?: "faithful" | "adapt" };

  if (!ads?.length) {
    return NextResponse.json({ error: "No ads provided" }, { status: 400 });
  }

  // Insert all as "queued" in discovered_ads
  const rows = ads.map((ad) => ({
    workspace_id: workspaceId,
    gethookd_ad_id: ad.gethookd_ad_id,
    brand_name: ad.brand_name,
    title: ad.title ?? "",
    body: ad.body ?? "",
    media_urls: ad.media_urls,
    source: "board" as const,
    status: "queued",
    pain_point: pain_point || null,
    source_board_name: board_name || null,
    swipe_mode: swipe_mode || "adapt",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await db
    .from("discovered_ads")
    .upsert(rows, { onConflict: "workspace_id,gethookd_ad_id" });

  if (error) {
    console.error("[ad-spy/swipe-batch] Upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    queued_count: ads.length,
  });
}
