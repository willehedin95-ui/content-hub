import { NextRequest, NextResponse } from "next/server";
import {
  isDataForSeoConfigured,
  getSearchVolume,
  getKeywordSuggestions,
  getKeywordsForSite,
} from "@/lib/dataforseo";
import { createServerSupabase } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!isDataForSeoConfigured()) {
    return NextResponse.json(
      { error: "DataForSEO not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to env." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { mode, keywords, target, market = "SE" } = body as {
    mode: "volume" | "suggestions" | "competitor";
    keywords?: string[];
    target?: string;
    market?: "SE" | "NO" | "DK";
  };

  try {
    let result;

    switch (mode) {
      case "volume": {
        if (!keywords?.length) {
          return NextResponse.json({ error: "keywords required" }, { status: 400 });
        }
        result = await getSearchVolume(keywords, market);
        break;
      }
      case "suggestions": {
        if (!keywords?.length) {
          return NextResponse.json({ error: "keywords required" }, { status: 400 });
        }
        result = await getKeywordSuggestions(keywords, market);
        break;
      }
      case "competitor": {
        if (!target) {
          return NextResponse.json({ error: "target URL/domain required" }, { status: 400 });
        }
        result = await getKeywordsForSite(target, market);
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid mode. Use: volume, suggestions, competitor" }, { status: 400 });
    }

    // Log usage cost
    if (result.cost > 0) {
      const db = createServerSupabase();
      await db.from("usage_logs").insert({
        type: "dataforseo",
        model: mode,
        cost_usd: result.cost,
        metadata: {
          mode,
          market,
          keyword_count: keywords?.length ?? 0,
          target: target ?? null,
          result_count: "keywords" in result ? result.keywords.length : result.suggestions.length,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Keyword research failed" },
      { status: 500 }
    );
  }
}
