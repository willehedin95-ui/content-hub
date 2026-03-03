import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase";
import { fetchAllGA4Metrics } from "@/lib/ga4";
import { fetchClarityInsights } from "@/lib/clarity";
import { getOrdersByPage } from "@/lib/shopify";
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
    const { data: settingsRow } = await db
      .from("app_settings")
      .select("settings")
      .limit(1)
      .single();
    const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;

    const ga4PropertyIds = (settings.ga4_property_ids ?? {}) as Record<string, string>;
    const clarityToken = settings.clarity_api_token as string | undefined;
    const clarityProjectIds = (settings.clarity_project_ids ?? {}) as Record<string, string>;
    const hasClarity = clarityToken && Object.values(clarityProjectIds).some((v) => !!v);

    // Fetch all data in parallel
    const [ga4Map, clarityInsights, shopifyMap] = await Promise.all([
      Object.keys(ga4PropertyIds).length > 0
        ? fetchAllGA4Metrics(ga4PropertyIds, days)
        : Promise.resolve(new Map()),
      hasClarity
        ? fetchClarityInsights(clarityToken, clarityProjectIds, Math.min(days, 3))
        : Promise.resolve([]),
      getOrdersByPage(new Date(Date.now() - days * 86400000).toISOString()),
    ]);

    // Build data context
    const dataLines: string[] = [];
    dataLines.push(`=== PAGE ANALYTICS (last ${days} days) ===`);
    dataLines.push("");

    // GA4 data
    if (ga4Map.size > 0) {
      dataLines.push("== GA4 Per-Page Metrics ==");
      dataLines.push("Language:Path | Views | Sessions | Users | Bounce Rate | Avg Duration | Engagement Rate | Conversions");
      dataLines.push("---");
      for (const [key, m] of ga4Map) {
        dataLines.push(
          `${key} | ${m.screenPageViews} | ${m.sessions} | ${m.totalUsers} | ${(m.bounceRate * 100).toFixed(1)}% | ${m.averageSessionDuration.toFixed(0)}s | ${(m.engagementRate * 100).toFixed(1)}% | ${m.conversions}`
        );
      }
      dataLines.push("");
    } else {
      dataLines.push("GA4: No data available");
      dataLines.push("");
    }

    // Clarity data
    if (clarityInsights.length > 0) {
      dataLines.push("== Clarity UX Signals (last 1-3 days) ==");
      dataLines.push("URL | Sessions | Scroll Depth | Active Time | Dead Clicks | Rage Clicks | Quickbacks | Excessive Scrolls");
      dataLines.push("---");
      for (const c of clarityInsights.slice(0, 50)) {
        dataLines.push(
          `${c.url} | ${c.totalSessionCount} | ${(c.scrollDepth * 100).toFixed(0)}% | ${c.activeTime.toFixed(0)}s | ${c.deadClickCount} | ${c.rageClickCount} | ${c.quickbackClickCount} | ${c.excessiveScrollCount}`
        );
      }
      dataLines.push("");
    } else {
      dataLines.push("Clarity: No data available");
      dataLines.push("");
    }

    // Shopify data
    if (shopifyMap.size > 0) {
      dataLines.push("== Shopify Orders by Page (utm_campaign) ==");
      dataLines.push("Page Slug | Orders | Revenue | Currency");
      dataLines.push("---");
      for (const [slug, data] of shopifyMap) {
        dataLines.push(`${slug} | ${data.orders} | ${data.revenue.toFixed(2)} | ${data.currency}`);
      }
      dataLines.push("");
    } else {
      dataLines.push("Shopify: No orders attributed to pages");
      dataLines.push("");
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
          content: `You are an expert ecommerce conversion rate optimization (CRO) analyst. You're analyzing landing page performance data for a Scandinavian ecommerce operation (HappySleep mattresses / Hydro13 products) selling in Sweden (sv), Norway (no), and Denmark (da).

Data comes from three sources:
- GA4: pageviews, sessions, bounce rate, engagement rate, conversions per page per language
- Clarity: UX signals per URL — scroll depth, rage clicks (frustrated clicks on non-interactive elements), dead clicks (clicks on elements that don't respond), quickbacks (immediate return to previous page)
- Shopify: orders attributed to pages via utm_campaign parameter

Analyze the data and provide conversion-focused insights. Focus on:
1. Which pages convert best/worst and why (cross-referencing GA4 + Clarity signals)
2. UX issues from Clarity (rage clicks, dead clicks = likely broken buttons or misleading elements; low scroll depth = content not engaging)
3. Cross-market comparison (same page in sv vs da vs no)
4. Specific actionable recommendations for improving conversion rates

Return a JSON object with exactly these keys:
- "summary": 2-3 sentence overview focusing on conversion performance
- "best_pages": Array of { "page": path, "language": lang code, "reason": why it converts well } — up to 3
- "worst_pages": Array of { "page": path, "language": lang code, "issue": what's wrong, "recommendation": specific fix } — up to 3
- "ux_issues": Array of { "page": path/url, "signal": which Clarity metric, "severity": "high" | "medium" | "low", "recommendation": specific fix } — up to 4
- "cross_market": Array of observation strings comparing same pages across markets — up to 3
- "action_items": Array of specific, prioritized next steps — up to 5

If data is limited, say so honestly rather than speculating.`,
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

    const insights = JSON.parse(content);

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
      metadata: { purpose: "page_analytics_insights", days },
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
