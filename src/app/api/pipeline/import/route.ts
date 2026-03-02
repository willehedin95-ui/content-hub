import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { listAdSets, listAdsInAdSet } from "@/lib/meta";

export const maxDuration = 120;

const COUNTRY_TO_LANG: Record<string, string> = {
  SE: "sv",
  DK: "da",
  NO: "no",
  DE: "de",
};

/** Parse ad set name to extract concept name and number.
 *  Handles: "SE #017 | statics | name", "SE#120 | quiz | name",
 *  "US#106 - adv - name - Copy", "#111 | gpt", "#114 - name", "#101 Name" */
function parseAdSetName(name: string): { conceptName: string; adSetNumber: string | null } {
  // Pattern: "{COUNTRY} #{number} | statics | {concept name}"
  const staticsMatch = name.match(/^[A-Z]{2}\s+#(\d+)\s*\|\s*statics\s*\|\s*(.+)$/i);
  if (staticsMatch) {
    return { conceptName: staticsMatch[2].trim(), adSetNumber: staticsMatch[1] };
  }
  // Pattern: "{COUNTRY}#{number} | type | name" (e.g. "SE#120 | quiz | name")
  const countryPipeMatch = name.match(/^[A-Z]{2}#(\d+)\s*\|\s*(.+)$/i);
  if (countryPipeMatch) {
    return { conceptName: countryPipeMatch[2].trim(), adSetNumber: countryPipeMatch[1] };
  }
  // Pattern: "US#NNN - type - name - Copy"
  const usCopyMatch = name.match(/^[A-Z]{2}#(\d+)\s*-\s*(.+?)\s*-\s*Copy$/i);
  if (usCopyMatch) {
    return { conceptName: usCopyMatch[2].trim(), adSetNumber: usCopyMatch[1] };
  }
  // Pattern: "#NNN | type | name" or "#NNN | name"
  const hashPipeMatch = name.match(/^#(\d+)\s*\|\s*(.+)$/);
  if (hashPipeMatch) {
    return { conceptName: hashPipeMatch[2].trim(), adSetNumber: hashPipeMatch[1] };
  }
  // Pattern: "#NNN - name"
  const hashDashMatch = name.match(/^#(\d+)\s*-\s*(.+)$/);
  if (hashDashMatch) {
    return { conceptName: hashDashMatch[2].trim(), adSetNumber: hashDashMatch[1] };
  }
  // Pattern: "#NNN Name" (space-separated)
  const hashSpaceMatch = name.match(/^#(\d+)\s+([A-Za-z].+)$/);
  if (hashSpaceMatch) {
    return { conceptName: hashSpaceMatch[2].trim(), adSetNumber: hashSpaceMatch[1] };
  }
  // Pattern: "#NNN" alone
  const hashOnlyMatch = name.match(/^#(\d+)$/);
  if (hashOnlyMatch) {
    return { conceptName: name, adSetNumber: hashOnlyMatch[1] };
  }
  // Fallback: use the whole name
  return { conceptName: name, adSetNumber: null };
}

// GET: Preview what would be imported
export async function GET() {
  try {
    const db = createServerSupabase();

    // Get all campaign mappings
    const { data: mappings, error: mappingsErr } = await db
      .from("meta_campaign_mappings")
      .select("*");
    if (mappingsErr) throw mappingsErr;

    // Get all tracked ad set IDs
    const { data: tracked, error: trackedErr } = await db
      .from("meta_campaigns")
      .select("meta_adset_id");
    if (trackedErr) throw trackedErr;

    const trackedAdSetIds = new Set(tracked?.map((t) => t.meta_adset_id) ?? []);

    const preview: Array<{
      campaignName: string;
      product: string;
      country: string;
      adSetId: string;
      adSetName: string;
      adSetStatus: string;
      conceptName: string;
    }> = [];

    for (const mapping of mappings ?? []) {
      const adSets = await listAdSets(mapping.meta_campaign_id);

      for (const adSet of adSets) {
        if (trackedAdSetIds.has(adSet.id)) continue;

        // Skip the template ad set (usually has "template" in name or is paused with no ads)
        if (mapping.template_adset_id === adSet.id) continue;
        // Only show active ad sets
        if (adSet.status !== "ACTIVE") continue;

        const { conceptName } = parseAdSetName(adSet.name);

        preview.push({
          campaignName: mapping.meta_campaign_name || `${mapping.product} ${mapping.country}`,
          product: mapping.product,
          country: mapping.country,
          adSetId: adSet.id,
          adSetName: adSet.name,
          adSetStatus: adSet.status,
          conceptName,
        });
      }
    }

    return NextResponse.json({ untracked: preview, count: preview.length });
  } catch (err) {
    console.error("Import preview error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview imports" },
      { status: 500 }
    );
  }
}

// POST: Import untracked ad sets
export async function POST() {
  try {
    const db = createServerSupabase();

    // Get all campaign mappings
    const { data: mappings, error: mappingsErr } = await db
      .from("meta_campaign_mappings")
      .select("*");
    if (mappingsErr) throw mappingsErr;

    // Get all tracked ad set IDs
    const { data: tracked, error: trackedErr } = await db
      .from("meta_campaigns")
      .select("meta_adset_id");
    if (trackedErr) throw trackedErr;

    const trackedAdSetIds = new Set(tracked?.map((t) => t.meta_adset_id) ?? []);

    // Group untracked ad sets by concept name to merge multi-country concepts
    const conceptMap = new Map<
      string,
      {
        name: string;
        conceptNumber: number | null;
        product: string;
        adSets: Array<{
          adSetId: string;
          adSetName: string;
          country: string;
          language: string;
          metaCampaignId: string;
        }>;
      }
    >();

    for (const mapping of mappings ?? []) {
      const adSets = await listAdSets(mapping.meta_campaign_id);

      for (const adSet of adSets) {
        if (trackedAdSetIds.has(adSet.id)) continue;
        if (mapping.template_adset_id === adSet.id) continue;
        // Only import active ad sets
        if (adSet.status !== "ACTIVE") continue;

        const { conceptName, adSetNumber } = parseAdSetName(adSet.name);
        const key = `${mapping.product}::${conceptName.toLowerCase()}`;
        const lang = COUNTRY_TO_LANG[mapping.country] || mapping.country.toLowerCase();

        if (!conceptMap.has(key)) {
          conceptMap.set(key, {
            name: conceptName,
            conceptNumber: adSetNumber ? parseInt(adSetNumber, 10) : null,
            product: mapping.product,
            adSets: [],
          });
        }

        conceptMap.get(key)!.adSets.push({
          adSetId: adSet.id,
          adSetName: adSet.name,
          country: mapping.country,
          language: lang,
          metaCampaignId: mapping.meta_campaign_id,
        });
      }
    }

    const imported: Array<{ name: string; product: string; languages: string[]; adsCount: number }> = [];

    for (const [, concept] of conceptMap) {
      const languages = [...new Set(concept.adSets.map((a) => a.language))];

      // Create image_jobs record
      const { data: imageJob, error: ijErr } = await db
        .from("image_jobs")
        .insert({
          name: concept.name,
          product: concept.product,
          concept_number: concept.conceptNumber,
          status: "completed",
          target_languages: languages,
          tags: ["imported"],
        })
        .select("id")
        .single();
      if (ijErr) {
        console.error(`Failed to create image_job for ${concept.name}:`, ijErr);
        continue;
      }

      let totalAds = 0;

      for (const adSet of concept.adSets) {
        // Create meta_campaigns record
        const { data: metaCampaign, error: mcErr } = await db
          .from("meta_campaigns")
          .insert({
            name: adSet.adSetName,
            meta_campaign_id: adSet.metaCampaignId,
            meta_adset_id: adSet.adSetId,
            image_job_id: imageJob.id,
            countries: [adSet.country],
            daily_budget: 0,
            language: adSet.language,
            product: concept.product,
            status: "pushed",
          })
          .select("id")
          .single();
        if (mcErr) {
          console.error(`Failed to create meta_campaign for ${adSet.adSetName}:`, mcErr);
          continue;
        }

        // Fetch ads in this ad set from Meta
        try {
          const ads = await listAdsInAdSet(adSet.adSetId);

          for (const ad of ads) {
            const { error: maErr } = await db.from("meta_ads").insert({
              campaign_id: metaCampaign.id,
              name: ad.name,
              meta_ad_id: ad.id,
              status: ad.status === "ACTIVE" ? "active" : "paused",
            });
            if (maErr) {
              console.error(`Failed to create meta_ad ${ad.name}:`, maErr);
            } else {
              totalAds++;
            }
          }
        } catch (adsErr) {
          console.error(`Failed to fetch ads for ad set ${adSet.adSetId}:`, adsErr);
        }
      }

      imported.push({
        name: concept.name,
        product: concept.product,
        languages,
        adsCount: totalAds,
      });
    }

    return NextResponse.json({
      imported,
      count: imported.length,
      message: `Imported ${imported.length} concepts`,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import" },
      { status: 500 }
    );
  }
}
