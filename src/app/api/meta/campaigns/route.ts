import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, objective, language, countries, daily_budget, ads } = body as {
    name: string;
    objective: string;
    language: string;
    countries: string[];
    daily_budget: number;
    ads: Array<{
      image_url: string;
      ad_copy: string;
      landing_page_url: string;
      aspect_ratio?: string;
    }>;
  };

  if (!name?.trim() || !objective || !language || !countries?.length || !daily_budget || !ads?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Create campaign
  const { data: campaign, error: campError } = await db
    .from("meta_campaigns")
    .insert({
      name: name.trim(),
      objective,
      language,
      countries,
      daily_budget,
      status: "draft",
    })
    .select()
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: campError?.message ?? "Failed to create campaign" }, { status: 500 });
  }

  // Create ad records
  const adRows = ads.map((ad, i) => ({
    campaign_id: campaign.id,
    name: `${name.trim()} - Ad ${i + 1}`,
    image_url: ad.image_url,
    ad_copy: ad.ad_copy,
    landing_page_url: ad.landing_page_url,
    aspect_ratio: ad.aspect_ratio || null,
    status: "pending",
  }));

  const { error: adError } = await db.from("meta_ads").insert(adRows);

  if (adError) {
    return NextResponse.json({ error: adError.message }, { status: 500 });
  }

  // Return campaign with ads
  const { data: full } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("id", campaign.id)
    .single();

  return NextResponse.json(full);
}
