import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { updateAd, updateCampaign, getCampaignBudget } from "@/lib/meta";

const META_TOKEN = () => process.env.META_SYSTEM_USER_TOKEN!;
const DELAY = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAdSetBudget(
  adsetId: string
): Promise<{ daily_budget: string; name: string }> {
  const token = META_TOKEN();
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${adsetId}?fields=daily_budget,name&access_token=${token}`
  );
  if (!res.ok) throw new Error(`Meta API error (${res.status})`);
  return res.json();
}

async function updateAdSetBudget(
  adsetId: string,
  dailyBudget: number
): Promise<void> {
  const token = META_TOKEN();
  const res = await fetch(`https://graph.facebook.com/v22.0/${adsetId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ daily_budget: String(dailyBudget) }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Meta API error (${res.status}): ${err}`);
  }
}

/**
 * POST /api/morning-brief/actions
 *
 * Actions:
 * - pause_ad: Pause a single ad
 * - pause_bleeders: Pause multiple bleeding ads
 * - scale_winner: Scale a winner's budget +20%
 * - apply_budget_shifts: Apply efficiency-based budget rebalancing
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const db = createServerSupabase();

  switch (action) {
    case "pause_ad": {
      const { ad_id, ad_name, campaign_name, reason } = body;
      if (!ad_id) {
        return NextResponse.json(
          { error: "ad_id is required" },
          { status: 400 }
        );
      }

      await updateAd(ad_id, { status: "PAUSED" });

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: ad_id,
        ad_name: ad_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "paused_bleeder",
        detail: reason || "Paused from Morning Brief",
        metrics: {},
      });

      return NextResponse.json({ ok: true, paused: ad_id });
    }

    case "pause_bleeders": {
      const { bleeders } = body as {
        bleeders: Array<{
          ad_id: string;
          ad_name?: string;
          campaign_name?: string;
          days_bleeding?: number;
          total_spend?: number;
          avg_ctr?: number;
          avg_cpa?: number;
        }>;
      };
      if (!bleeders?.length) {
        return NextResponse.json(
          { error: "bleeders array is required" },
          { status: 400 }
        );
      }

      const results: Array<{
        ad_id: string;
        status: "paused" | "failed";
        error?: string;
      }> = [];

      for (const b of bleeders) {
        try {
          await updateAd(b.ad_id, { status: "PAUSED" });
          await sleep(DELAY);

          // Log to auto_paused_ads
          await db.from("auto_paused_ads").insert({
            meta_ad_id: b.ad_id,
            ad_name: b.ad_name ?? null,
            campaign_name: b.campaign_name ?? null,
            reason: `Manually paused from Morning Brief: ${b.days_bleeding ?? "?"}d bleeding, ${b.total_spend?.toFixed(0) ?? "?"} spent`,
            days_bleeding: b.days_bleeding ?? null,
            total_spend: b.total_spend ?? null,
          });

          // Log to ad_learnings
          await db.from("ad_learnings").insert({
            meta_ad_id: b.ad_id,
            ad_name: b.ad_name ?? null,
            campaign_name: b.campaign_name ?? null,
            event_type: "paused_bleeder",
            detail: `Paused from Morning Brief: ${b.days_bleeding ?? "?"}d bleeding, ${b.total_spend?.toFixed(0) ?? "?"} spent, CTR ${b.avg_ctr?.toFixed(2) ?? "?"}%`,
            metrics: {
              days_bleeding: b.days_bleeding,
              total_spend: b.total_spend,
              avg_ctr: b.avg_ctr,
              avg_cpa: b.avg_cpa,
            },
          });

          results.push({ ad_id: b.ad_id, status: "paused" });
        } catch (err) {
          results.push({
            ad_id: b.ad_id,
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        paused: results.filter((r) => r.status === "paused").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      });
    }

    case "scale_winner": {
      const { ad_id, adset_id, campaign_id, ad_name, campaign_name } = body;
      if (!ad_id || !campaign_id) {
        return NextResponse.json(
          { error: "ad_id and campaign_id are required" },
          { status: 400 }
        );
      }

      let level: "adset" | "campaign" = "campaign";
      let oldBudget = 0;
      let newBudget = 0;

      // Try ad set level first (ABO)
      if (adset_id) {
        try {
          const adsetInfo = await fetchAdSetBudget(adset_id);
          const adsetBudget = Number(adsetInfo.daily_budget || 0);
          if (adsetBudget > 0) {
            level = "adset";
            oldBudget = adsetBudget;
            newBudget = Math.round(adsetBudget * 1.2);
            await updateAdSetBudget(adset_id, newBudget);
          }
        } catch {
          // Fall through to campaign level
        }
      }

      // Fall back to campaign level (CBO)
      if (level === "campaign") {
        const campaignInfo = await getCampaignBudget(campaign_id);
        const campaignBudget = Number(campaignInfo.daily_budget || 0);
        oldBudget = campaignBudget;
        newBudget = Math.round(campaignBudget * 1.2);
        await updateCampaign(campaign_id, {
          daily_budget: String(newBudget),
        });
      }

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: ad_id,
        ad_name: ad_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "graduated_winner",
        detail: `${level === "adset" ? "Ad set" : "Campaign"} budget +20% (${(oldBudget / 100).toFixed(0)} → ${(newBudget / 100).toFixed(0)}/day)`,
        metrics: { old_budget: oldBudget, new_budget: newBudget, level },
      });

      return NextResponse.json({
        ok: true,
        level,
        old_budget: oldBudget / 100,
        new_budget: newBudget / 100,
      });
    }

    case "apply_budget_shifts": {
      const { shifts } = body as {
        shifts: Array<{
          campaign_id: string;
          campaign_name?: string;
          efficiency_score?: number;
          recommended_budget_share: number;
          recommendation: string;
        }>;
      };
      if (!shifts?.length) {
        return NextResponse.json(
          { error: "shifts array is required" },
          { status: 400 }
        );
      }

      // Get current budgets
      let totalBudget = 0;
      const currentBudgets = new Map<string, number>();

      for (const s of shifts) {
        try {
          const info = await getCampaignBudget(s.campaign_id);
          const budget = Number(info.daily_budget || 0);
          currentBudgets.set(s.campaign_id, budget);
          totalBudget += budget;
          await sleep(DELAY);
        } catch {
          // Skip campaigns that can't be read
        }
      }

      if (totalBudget === 0) {
        return NextResponse.json(
          { error: "No campaign budgets found" },
          { status: 400 }
        );
      }

      const results: Array<{
        campaign_id: string;
        status: "updated" | "skipped" | "failed";
        old_budget?: number;
        new_budget?: number;
      }> = [];

      for (const s of shifts) {
        const current = currentBudgets.get(s.campaign_id);
        if (current === undefined) {
          results.push({ campaign_id: s.campaign_id, status: "skipped" });
          continue;
        }

        const newBudget = Math.round(
          (s.recommended_budget_share / 100) * totalBudget
        );

        if (Math.abs(newBudget - current) < 100) {
          // Less than $1 difference, skip
          results.push({ campaign_id: s.campaign_id, status: "skipped" });
          continue;
        }

        try {
          await updateCampaign(s.campaign_id, {
            daily_budget: String(newBudget),
          });
          await sleep(DELAY);

          await db.from("ad_learnings").insert({
            meta_ad_id: s.campaign_id,
            ad_name: s.campaign_name ?? null,
            campaign_name: s.campaign_name ?? null,
            event_type: "budget_shifted",
            detail: `Campaign budget ${s.recommendation}: ${(current / 100).toFixed(0)} → ${(newBudget / 100).toFixed(0)}/day (efficiency: ${s.efficiency_score?.toFixed(1) ?? "?"})`,
            metrics: {
              old_budget: current,
              new_budget: newBudget,
              recommendation: s.recommendation,
              efficiency_score: s.efficiency_score,
            },
          });

          results.push({
            campaign_id: s.campaign_id,
            status: "updated",
            old_budget: current / 100,
            new_budget: newBudget / 100,
          });
        } catch (err) {
          results.push({
            campaign_id: s.campaign_id,
            status: "failed",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        updated: results.filter((r) => r.status === "updated").length,
        results,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
