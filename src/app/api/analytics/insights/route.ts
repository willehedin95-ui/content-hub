import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { fetchAnalyticsSummary, fetchCampaignPerformance, AIInsights } from "@/lib/analytics";
import { createServerSupabase } from "@/lib/supabase";
import { OPENAI_MODEL } from "@/lib/constants";
import { calcOpenAICost } from "@/lib/pricing";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { days = 7 } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  try {
    const db = createServerSupabase();

    // Fetch all data + concept pipeline context in parallel
    const [summary, campaigns, conceptsResult, lastPushResult] = await Promise.all([
      fetchAnalyticsSummary(days),
      fetchCampaignPerformance(days),
      db.from("image_jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
        .not("status", "eq", "draft"),
      db.from("meta_campaigns")
        .select("created_at")
        .eq("status", "pushed")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // Build data context for AI
    const dataLines: string[] = [];
    dataLines.push(`=== ACCOUNT SUMMARY (last ${days} days) ===`);

    if (summary.meta) {
      dataLines.push(`Meta Ad Spend: ${summary.meta.spend.toFixed(0)} SEK`);
      dataLines.push(`Meta Impressions: ${summary.meta.impressions.toLocaleString()}`);
      dataLines.push(`Meta Clicks: ${summary.meta.clicks.toLocaleString()}`);
      dataLines.push(`Meta CTR: ${summary.meta.ctr.toFixed(2)}%`);
      dataLines.push(`Meta CPC: ${summary.meta.cpc.toFixed(2)} SEK`);
    } else {
      dataLines.push("Meta Ads: Not connected");
    }

    if (summary.googleAds) {
      dataLines.push(`Google Ads Spend: ${summary.googleAds.spend.toFixed(0)} SEK`);
      dataLines.push(`Google Ads Impressions: ${summary.googleAds.impressions.toLocaleString()}`);
      dataLines.push(`Google Ads Clicks: ${summary.googleAds.clicks.toLocaleString()}`);
    }

    if (summary.shopify) {
      dataLines.push(`Shopify Orders: ${summary.shopify.orders}`);
      dataLines.push(`Shopify Revenue: ${summary.shopify.revenue.toFixed(2)} ${summary.shopify.currency}`);
      dataLines.push(`Avg Order Value: ${summary.shopify.avgOrderValue.toFixed(2)} ${summary.shopify.currency}`);
    } else {
      dataLines.push("Shopify: Not connected");
    }

    if (summary.roas !== null) {
      dataLines.push(`ROAS: ${summary.roas.toFixed(2)}x`);
    }

    if (campaigns.length > 0) {
      dataLines.push("");
      dataLines.push("=== CAMPAIGN PERFORMANCE ===");
      dataLines.push("Campaign | Product | Language | Spend | Impressions | Clicks | CTR | CPC | Orders | Revenue | ROAS");
      dataLines.push("---");
      for (const c of campaigns) {
        dataLines.push(
          `${c.name} | ${c.product || "—"} | ${c.language} | ${c.spend.toFixed(0)} SEK | ${c.impressions} | ${c.clicks} | ${c.ctr.toFixed(2)}% | ${c.cpc.toFixed(2)} SEK | ${c.orders} | ${c.revenue.toFixed(0)} SEK | ${c.roas.toFixed(2)}x`
        );
      }
    }

    // Concept pipeline context
    dataLines.push("");
    dataLines.push("=== CREATIVE PIPELINE ===");
    const recentConcepts = conceptsResult.count ?? 0;
    dataLines.push(`New concepts created (last 14 days): ${recentConcepts}`);

    const lastPush = lastPushResult.data?.[0];
    if (lastPush) {
      const daysSinceLastPush = Math.floor(
        (Date.now() - new Date(lastPush.created_at).getTime()) / 86400000
      );
      dataLines.push(`Days since last ad concept pushed to Meta: ${daysSinceLastPush}`);
    } else {
      dataLines.push("No concepts have been pushed to Meta yet.");
    }

    dataLines.push(`Total active campaigns: ${campaigns.length}`);

    // CASH DNA breakdown (if concepts have DNA data)
    const campaignsWithDna = campaigns.filter(c => c.cashDna);
    if (campaignsWithDna.length > 0) {
      dataLines.push("");
      dataLines.push("=== CREATIVE DNA (CASH Framework) ===");
      dataLines.push("Campaign | Concept Type | Angle | Style | Awareness Level");
      dataLines.push("---");
      for (const c of campaignsWithDna) {
        const d = c.cashDna!;
        dataLines.push(
          `${c.name} | ${d.concept_type || "—"} | ${d.angle || "—"} | ${d.style || "—"} | ${d.awareness_level || "—"}`
        );
      }

      // Aggregate by angle
      const byAngle = new Map<string, { spend: number; revenue: number; count: number }>();
      for (const c of campaignsWithDna) {
        const angle = c.cashDna!.angle || "Unknown";
        const entry = byAngle.get(angle) ?? { spend: 0, revenue: 0, count: 0 };
        entry.spend += c.spend;
        entry.revenue += c.revenue;
        entry.count++;
        byAngle.set(angle, entry);
      }
      if (byAngle.size > 1) {
        dataLines.push("");
        dataLines.push("Performance by Angle:");
        dataLines.push("Angle | Campaigns | Spend | Revenue | ROAS");
        for (const [angle, d] of byAngle) {
          const roas = d.spend > 0 ? (d.revenue / d.spend).toFixed(2) : "N/A";
          dataLines.push(`${angle} | ${d.count} | ${d.spend.toFixed(0)} SEK | ${d.revenue.toFixed(0)} SEK | ${roas}x`);
        }
      }

      // Aggregate by style
      const byStyle = new Map<string, { spend: number; revenue: number; count: number }>();
      for (const c of campaignsWithDna) {
        const style = c.cashDna!.style || "Unknown";
        const entry = byStyle.get(style) ?? { spend: 0, revenue: 0, count: 0 };
        entry.spend += c.spend;
        entry.revenue += c.revenue;
        entry.count++;
        byStyle.set(style, entry);
      }
      if (byStyle.size > 1) {
        dataLines.push("");
        dataLines.push("Performance by Style:");
        dataLines.push("Style | Campaigns | Spend | Revenue | ROAS");
        for (const [style, d] of byStyle) {
          const roas = d.spend > 0 ? (d.revenue / d.spend).toFixed(2) : "N/A";
          dataLines.push(`${style} | ${d.count} | ${d.spend.toFixed(0)} SEK | ${d.revenue.toFixed(0)} SEK | ${roas}x`);
        }
      }
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 3000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert Meta ads coach and ecommerce analytics advisor. You're analyzing data for a Scandinavian ecommerce operation (HappySleep mattresses / Hydro13 products) that sells primarily in Sweden, Norway, and Denmark via Meta ads driving traffic to landing pages. All monetary values (spend, revenue, CPC) are in SEK (Swedish Krona).

Your job is to provide specific, actionable analysis — never generic advice. Reference actual campaign names and numbers from the data.

META ADS BEST PRACTICES YOU SHOULD APPLY:
- Testing cadence: Top advertisers test 2-3 new ad concepts per week at this spend level
- Ad set structure: Each ad set should have 3-5 images to give Meta's algorithm options to optimize
- Kill criteria: Pause ads that have spent 2x the target CPA with zero conversions
- Give new ads at least 3-5 days and 500+ SEK spend before judging performance
- Budget allocation: 80% to proven winners, 20% to testing new concepts
- Split testing: Change one variable at a time (image, headline, or copy — not all at once)
- Creative fatigue: Ads typically fatigue after 2-4 weeks at high frequency. Refresh regularly.
- CPC benchmarks: Healthy CPC for Scandinavian ecommerce is 5-15 SEK
- ROAS target: 2x+ ROAS is healthy, 3x+ is excellent, below 1x is losing money

Return a JSON object with exactly these keys:
- "summary": A 2-3 sentence executive overview of performance
- "top_performers": Array of { "name": campaign name, "reason": why it's performing well } — up to 3
- "underperformers": Array of { "name": campaign name, "issue": what's wrong, "recommendation": specific action } — up to 3
- "budget_recommendations": Array of { "action": "increase" | "decrease" | "pause", "campaign": name, "reason": why } — up to 3
- "trends": Array of observation strings about patterns in the data — up to 4
- "action_items": Array of specific next-step strings the advertiser should take — up to 5
- "coaching_tips": Array of { "priority": "high" | "medium" | "low", "category": "budget" | "creative" | "audience" | "testing", "tip": specific actionable coaching advice based on their data, "reasoning": why this matters for their business } — up to 5. These should be strategic coaching advice, not just restating the data. Think like a media buyer coaching a client.
- "dna_insights": (ONLY if CASH DNA data is provided) Object with { "best_angle": which angle performs best, "best_style": which style performs best, "iteration_suggestions": Array of 2-4 specific iteration ideas based on winning DNA combos }. If no DNA data is available, omit this key entirely.

CREATIVE DNA ANALYSIS (if CASH framework data is present):
- Identify which angles and styles perform best/worst by ROAS
- Suggest specific iterations: "Your 'Root Cause' angle with 'UGC-style' is your best combo at 3.2x ROAS — create 2-3 more concepts with this DNA"
- Note awareness level patterns — do certain levels convert better?
- Recommend testing underexplored angle/style combinations

If data is limited or missing, say so honestly rather than speculating. Focus on ROI, ROAS, and conversion efficiency.`,
        },
        {
          role: "user",
          content: dataLines.join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "No analysis returned" }, { status: 500 });
    }

    const insights = JSON.parse(content) as AIInsights;

    // Log usage
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = calcOpenAICost(inputTokens, outputTokens);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      metadata: { purpose: "analytics_insights", days, campaign_count: campaigns.length },
    });

    return NextResponse.json({
      insights,
      cost: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
