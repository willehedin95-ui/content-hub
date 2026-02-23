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
    // Fetch all data
    const [summary, campaigns] = await Promise.all([
      fetchAnalyticsSummary(days),
      fetchCampaignPerformance(days),
    ]);

    // Build data context for AI
    const dataLines: string[] = [];
    dataLines.push(`=== ACCOUNT SUMMARY (last ${days} days) ===`);

    if (summary.meta) {
      dataLines.push(`Meta Ad Spend: $${summary.meta.spend.toFixed(2)}`);
      dataLines.push(`Meta Impressions: ${summary.meta.impressions.toLocaleString()}`);
      dataLines.push(`Meta Clicks: ${summary.meta.clicks.toLocaleString()}`);
      dataLines.push(`Meta CTR: ${summary.meta.ctr.toFixed(2)}%`);
      dataLines.push(`Meta CPC: $${summary.meta.cpc.toFixed(2)}`);
    } else {
      dataLines.push("Meta Ads: Not connected");
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
          `${c.name} | ${c.product || "—"} | ${c.language} | $${c.spend.toFixed(2)} | ${c.impressions} | ${c.clicks} | ${c.ctr.toFixed(2)}% | $${c.cpc.toFixed(2)} | ${c.orders} | ${c.revenue.toFixed(2)} | ${c.roas.toFixed(2)}x`
        );
      }
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert ecommerce analytics advisor specializing in paid advertising and conversion optimization. You're analyzing data for a Scandinavian ecommerce operation (HappySleep mattresses / Hydro13 products) that sells primarily in Sweden, Norway, and Denmark via Meta ads driving traffic to landing pages.

Analyze the provided advertising spend and sales data. Provide actionable, specific insights — not generic advice.

Return a JSON object with exactly these keys:
- "summary": A 2-3 sentence executive overview of performance
- "top_performers": Array of { "name": campaign name, "reason": why it's performing well } — up to 3
- "underperformers": Array of { "name": campaign name, "issue": what's wrong, "recommendation": specific action } — up to 3
- "budget_recommendations": Array of { "action": "increase" | "decrease" | "pause", "campaign": name, "reason": why } — up to 3
- "trends": Array of observation strings about patterns in the data — up to 4
- "action_items": Array of specific next-step strings the advertiser should take — up to 5

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

    const db = createServerSupabase();
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
