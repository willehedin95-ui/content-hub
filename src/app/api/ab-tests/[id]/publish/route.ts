import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishABTest } from "@/lib/cloudflare-pages";
import { Language } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.CF_PAGES_ACCOUNT_ID || !process.env.CF_PAGES_API_TOKEN) {
    return NextResponse.json(
      { error: "Cloudflare Pages not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Fetch the A/B test with page info
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select(`*, pages (slug)`)
    .eq("id", id)
    .single();

  if (tErr || !test) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  // Fetch both translations
  const { data: control } = await db
    .from("translations")
    .select("translated_html")
    .eq("id", test.control_id)
    .single();

  const { data: variant } = await db
    .from("translations")
    .select("translated_html")
    .eq("id", test.variant_id)
    .single();

  if (!control?.translated_html || !variant?.translated_html) {
    return NextResponse.json(
      { error: "Both variants must have translated HTML" },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "APP_URL not configured. Set it in environment variables." },
      { status: 500 }
    );
  }

  // Mark test as active before deploying
  await db
    .from("ab_tests")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    const result = await publishABTest(
      control.translated_html,
      variant.translated_html,
      test.pages.slug,
      test.language as Language,
      test.split,
      id,
      appUrl
    );

    // Update test with router URL
    const { data: updated, error: uErr } = await db
      .from("ab_tests")
      .update({
        router_url: result.routerUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    // Update both translations with their variant URLs
    await db
      .from("translations")
      .update({
        published_url: result.controlUrl,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", test.control_id);

    await db
      .from("translations")
      .update({
        published_url: result.variantUrl,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", test.variant_id);

    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({
      ...updated,
      router_url: result.routerUrl,
      control_url: result.controlUrl,
      variant_url: result.variantUrl,
    });
  } catch (err) {
    // Revert status on failure
    await db
      .from("ab_tests")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id);

    const message = err instanceof Error ? err.message : "A/B publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
