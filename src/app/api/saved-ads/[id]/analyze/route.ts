import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { runCashAnalysis } from "@/app/api/telegram/webhook/cash-analysis";

export const maxDuration = 60;

// POST /api/saved-ads/[id]/analyze — re-run CASH analysis on a saved ad
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Fetch the saved ad
  const { data: ad, error: adErr } = await db
    .from("saved_ads")
    .select("*")
    .eq("id", id)
    .single();

  if (adErr || !ad) {
    return safeError(adErr ?? new Error("Not found"), "Saved ad not found", 404);
  }

  if (!ad.media_url) {
    return NextResponse.json(
      { error: "Ad has no media URL" },
      { status: 400 }
    );
  }

  if (ad.media_type !== "image") {
    return NextResponse.json(
      { error: "CASH analysis is only supported for image ads" },
      { status: 400 }
    );
  }

  try {
    const adCopy =
      ad.headline || ad.body || ad.brand_name
        ? {
            headline: ad.headline || null,
            body: ad.body || null,
            brand: ad.brand_name || null,
          }
        : null;

    const analysis = await runCashAnalysis(
      db,
      id,
      ad.media_url,
      adCopy,
      ad.user_notes || null
    );

    return NextResponse.json({ cash_analysis: analysis });
  } catch (err) {
    return safeError(err, "CASH analysis failed");
  }
}
