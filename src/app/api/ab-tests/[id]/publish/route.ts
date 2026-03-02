import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishABTest, ABTestAnalyticsConfig } from "@/lib/cloudflare-pages";
import { Language } from "@/types";
import { isValidUUID } from "@/lib/validation";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
    .select("*")
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

  // Load analytics settings from DB
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();

  const appSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const ga4Ids = (appSettings.ga4_measurement_ids as Record<string, string>) ?? {};
  const excludedIps = (appSettings.excluded_ips as string[]) ?? [];
  const analytics: ABTestAnalyticsConfig = {
    ga4MeasurementId: ga4Ids[test.language] || undefined,
    clarityProjectId: (appSettings.clarity_project_id as string) || undefined,
    metaPixelId: (appSettings.meta_pixel_id as string) || undefined,
    shopifyDomains: ((appSettings.shopify_domains as string) || "")
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean),
    hubUrl: appUrl,
    excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
  };

  // Mark test as active before deploying
  await db
    .from("ab_tests")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    const result = await publishABTest(
      control.translated_html,
      variant.translated_html,
      test.slug,
      test.language as Language,
      test.split,
      id,
      appUrl,
      analytics
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
