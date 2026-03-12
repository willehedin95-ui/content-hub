import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidLanguage, isValidBudget } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { META_OBJECTIVES, COUNTRY_MAP } from "@/types";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch campaigns");
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    objective,
    language,
    countries,
    daily_budget,
    meta_campaign_id,
    product,
    start_time,
    end_time,
    ads,
  } = body as {
    name: string;
    objective: string;
    language: string;
    countries: string[];
    daily_budget?: number;
    meta_campaign_id?: string | null;
    product?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    ads: Array<{
      image_url: string;
      ad_copy: string;
      headline?: string;
      source_primary_text?: string;
      source_headline?: string;
      landing_page_url: string;
      aspect_ratio?: string;
    }>;
  };

  if (!name?.trim() || !objective || !language || !countries?.length || !ads?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!isValidLanguage(language)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  if (daily_budget && !isValidBudget(daily_budget)) {
    return NextResponse.json({ error: "Budget must be a positive number" }, { status: 400 });
  }

  const validObjectives: readonly string[] = META_OBJECTIVES.map((o) => o.value);
  if (!validObjectives.includes(objective)) {
    return NextResponse.json({ error: "Invalid campaign objective" }, { status: 400 });
  }

  const validCountries = Object.values(COUNTRY_MAP);
  if (!countries.every((c: string) => validCountries.includes(c))) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }

  if (start_time && isNaN(Date.parse(start_time))) {
    return NextResponse.json({ error: "Invalid start_time format" }, { status: 400 });
  }
  if (end_time && isNaN(Date.parse(end_time))) {
    return NextResponse.json({ error: "Invalid end_time format" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Create campaign (ad set) record
  const workspaceId = await getWorkspaceId();
  const { data: campaign, error: campError } = await db
    .from("meta_campaigns")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      objective,
      language,
      countries,
      daily_budget: daily_budget || 0,
      product: product || null,
      meta_campaign_id: meta_campaign_id || null,
      start_time: start_time || null,
      end_time: end_time || null,
      status: "draft",
    })
    .select()
    .single();

  if (campError || !campaign) {
    return safeError(campError, "Failed to create campaign");
  }

  // Auto-pair 9:16 sibling for each 1:1 image
  const imageUrls = [...new Set(ads.map((a) => a.image_url))];
  const url9x16Map = new Map<string, string>();

  if (imageUrls.length > 0) {
    const { data: translations } = await db
      .from("image_translations")
      .select("translated_url, source_image_id, language")
      .in("translated_url", imageUrls);

    if (translations?.length) {
      const sourceImageIds = [...new Set(translations.map((t) => t.source_image_id))];

      const { data: siblings } = await db
        .from("image_translations")
        .select("translated_url, source_image_id, language")
        .in("source_image_id", sourceImageIds)
        .eq("aspect_ratio", "9:16")
        .eq("status", "completed")
        .not("translated_url", "is", null);

      const siblingMap = new Map<string, string>();
      for (const s of siblings ?? []) {
        siblingMap.set(`${s.source_image_id}:${s.language}`, s.translated_url);
      }

      for (const t of translations) {
        const url9x16 = siblingMap.get(`${t.source_image_id}:${t.language}`);
        if (url9x16) {
          url9x16Map.set(t.translated_url, url9x16);
        }
      }
    }
  }

  // Create ad records
  const adRows = ads.map((ad, i) => ({
    campaign_id: campaign.id,
    name: `${name.trim()} - Ad ${i + 1}`,
    image_url: ad.image_url,
    image_url_9x16: url9x16Map.get(ad.image_url) || null,
    ad_copy: ad.ad_copy,
    headline: ad.headline || null,
    source_primary_text: ad.source_primary_text || null,
    source_headline: ad.source_headline || null,
    landing_page_url: ad.landing_page_url,
    aspect_ratio: ad.aspect_ratio || null,
    status: "pending",
  }));

  const { error: adError } = await db.from("meta_ads").insert(adRows);

  if (adError) {
    return safeError(adError, "Failed to create ads");
  }

  // Return campaign with ads
  const { data: full } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("id", campaign.id)
    .single();

  return NextResponse.json(full);
}
