import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { updateAd, updateCampaign, getCampaignBudget } from "@/lib/meta";

const DELAY = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  try {
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
      const { ad_id, campaign_id, ad_name, campaign_name } = body;
      if (!campaign_id) {
        return NextResponse.json(
          { error: "campaign_id is required" },
          { status: 400 }
        );
      }

      // CBO: increase campaign budget by 20%
      const campaignInfo = await getCampaignBudget(campaign_id);
      const oldBudget = Number(campaignInfo.daily_budget || 0);
      const newBudget = Math.round(oldBudget * 1.2);
      await updateCampaign(campaign_id, {
        daily_budget: String(newBudget),
      });

      // Log to ad_learnings (use campaign_id so cooldown check can find it)
      await db.from("ad_learnings").insert({
        meta_ad_id: campaign_id,
        ad_name: ad_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "graduated_winner",
        detail: `Campaign budget +20% (${(oldBudget / 100).toFixed(0)} → ${(newBudget / 100).toFixed(0)}/day)`,
        metrics: { old_budget: oldBudget, new_budget: newBudget, triggering_ad_id: ad_id },
      });

      return NextResponse.json({
        ok: true,
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

    case "pause_adset": {
      const { adset_id, adset_name, campaign_name, reason } = body;
      if (!adset_id) {
        return NextResponse.json(
          { error: "adset_id is required" },
          { status: 400 }
        );
      }

      // Pause ad set via Meta Graph API
      const token = process.env.META_SYSTEM_USER_TOKEN!;
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${adset_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "PAUSED" }),
        }
      );
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Meta API error (${res.status}): ${err}`);
      }

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: adset_id,
        ad_name: adset_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "paused_adset",
        detail: reason || "Ad set paused from Daily Actions",
        metrics: {},
      });

      return NextResponse.json({ ok: true, paused_adset: adset_id });
    }

    case "increase_budget": {
      const { campaign_ids, extra_per_campaign, market, concepts_count } = body as {
        campaign_ids: string[];
        extra_per_campaign: number; // in cents (Meta format)
        market: string;
        concepts_count: number;
      };
      if (!campaign_ids?.length || !extra_per_campaign) {
        return NextResponse.json(
          { error: "campaign_ids and extra_per_campaign are required" },
          { status: 400 }
        );
      }

      const results: Array<{
        campaign_id: string;
        old_budget: number;
        new_budget: number;
      }> = [];

      for (const campaignId of campaign_ids) {
        const info = await getCampaignBudget(campaignId);
        const oldBudget = Number(info.daily_budget || 0);
        const newBudget = oldBudget + extra_per_campaign;

        await updateCampaign(campaignId, {
          daily_budget: String(newBudget),
        });
        await sleep(DELAY);

        results.push({
          campaign_id: campaignId,
          old_budget: oldBudget / 100,
          new_budget: newBudget / 100,
        });
      }

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: campaign_ids[0],
        campaign_name: market,
        event_type: "budget_increased_for_testing",
        detail: `Budget increased to fit ${concepts_count} new concept${concepts_count !== 1 ? "s" : ""} in ${market}: ${results.map((r) => `${r.old_budget} → ${r.new_budget}`).join(", ")}/day`,
        metrics: { market, concepts_count, results },
      });

      return NextResponse.json({
        ok: true,
        results,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
  } catch (err) {
    console.error(`[morning-brief/actions] ${action} failed:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
