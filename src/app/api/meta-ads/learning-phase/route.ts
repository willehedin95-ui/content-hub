import { NextResponse } from "next/server";

export const maxDuration = 15;

const META_API_BASE = "https://graph.facebook.com/v22.0";

interface MetaAdSetRow {
  id: string;
  name: string;
  effective_status: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  issues_info?: Array<{ error_code?: number; error_summary?: string; level?: string }>;
}

interface LearningPhaseAdSet {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  effective_status: string;
  learning_phase: "active" | "learning" | "learning_limited" | "unknown";
  daily_budget: number | null;
}

function determineLearningPhase(adset: MetaAdSetRow): LearningPhaseAdSet["learning_phase"] {
  // Explicit LEARNING_LIMITED effective_status
  if (adset.effective_status === "LEARNING_LIMITED") {
    return "learning_limited";
  }

  // ACTIVE but check issues_info for learning_limited signals
  if (adset.effective_status === "ACTIVE") {
    const hasLearningLimited = adset.issues_info?.some(
      (issue) =>
        issue.error_summary?.toLowerCase().includes("learning limited") ||
        issue.level === "LEARNING_LIMITED"
    );
    return hasLearningLimited ? "learning_limited" : "active";
  }

  // Any other status (e.g. still in learning phase)
  return "learning";
}

export async function GET() {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !adAccountId) {
    return NextResponse.json(
      { error: "META_SYSTEM_USER_TOKEN or META_AD_ACCOUNT_ID not configured" },
      { status: 500 }
    );
  }

  try {
    const fields = "id,name,effective_status,status,campaign_id,daily_budget,issues_info";
    const filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "LEARNING_LIMITED"] },
    ]);

    const url =
      `${META_API_BASE}/act_${adAccountId}/adsets` +
      `?fields=${fields}` +
      `&filtering=${encodeURIComponent(filtering)}` +
      `&limit=200`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      let errorMessage = `Meta API error (${res.status})`;
      try {
        const data = await res.json();
        if (data.error?.message) {
          errorMessage = data.error.message;
        }
      } catch {
        // ignore parse errors
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const json = await res.json();
    const rawAdsets = (json.data ?? []) as MetaAdSetRow[];

    // Handle pagination — collect all pages
    let nextUrl = json.paging?.next as string | undefined;
    while (nextUrl) {
      const pageRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!pageRes.ok) break;
      const pageJson = await pageRes.json();
      rawAdsets.push(...((pageJson.data ?? []) as MetaAdSetRow[]));
      nextUrl = pageJson.paging?.next as string | undefined;
    }

    const adsets: LearningPhaseAdSet[] = rawAdsets.map((adset) => ({
      adset_id: adset.id,
      adset_name: adset.name,
      campaign_id: adset.campaign_id,
      effective_status: adset.effective_status,
      learning_phase: determineLearningPhase(adset),
      daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
    }));

    return NextResponse.json({ adsets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
