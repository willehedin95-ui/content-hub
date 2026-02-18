import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishPage } from "@/lib/cloudflare-pages";
import { Language } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { winner } = await req.json();

  if (winner !== "control" && winner !== "b") {
    return NextResponse.json(
      { error: "winner must be 'control' or 'b'" },
      { status: 400 }
    );
  }

  if (!process.env.CF_PAGES_ACCOUNT_ID || !process.env.CF_PAGES_API_TOKEN) {
    return NextResponse.json(
      { error: "Cloudflare Pages not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Fetch the A/B test
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select(`*, pages (slug)`)
    .eq("id", id)
    .single();

  if (tErr || !test) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  const winningTranslationId =
    winner === "control" ? test.control_id : test.variant_id;

  // Fetch the winning translation's HTML
  const { data: winnerTranslation } = await db
    .from("translations")
    .select("translated_html")
    .eq("id", winningTranslationId)
    .single();

  if (!winnerTranslation?.translated_html) {
    return NextResponse.json(
      { error: "Winning translation has no HTML" },
      { status: 400 }
    );
  }

  try {
    // Deploy the winning HTML to the main slug (replaces router)
    const result = await publishPage(
      winnerTranslation.translated_html,
      test.pages.slug,
      test.language as Language
    );

    // Update the control translation with the published URL
    await db
      .from("translations")
      .update({
        published_url: result.url,
        status: "published",
        // If variant B won, copy its HTML to the control translation
        ...(winner === "b" ? { translated_html: winnerTranslation.translated_html } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", test.control_id);

    // Mark test as completed
    const { data: updated, error: uErr } = await db
      .from("ab_tests")
      .update({
        status: "completed",
        winner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({
      ...updated,
      published_url: result.url,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to declare winner";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
