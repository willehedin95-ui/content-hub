import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { calculateCoverageMatrix, identifyCoverageGaps, generateSuggestions } from "@/lib/coverage-matrix";
import type { AutoPipelineConcept, Product } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/pipeline/coverage?product=happysleep
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const product = (searchParams.get("product") || "happysleep") as Product;
    const markets = ["NO", "DK"]; // HappySleep markets

    const supabase = createServerSupabase();

    // Fetch all concepts for this product
    const { data: concepts, error } = await supabase
      .from("pipeline_concepts")
      .select("*")
      .eq("product", product)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[coverage] Fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch concepts" }, { status: 500 });
    }

    // Calculate matrix
    const cells = calculateCoverageMatrix(concepts as AutoPipelineConcept[], product, markets);
    const gaps = identifyCoverageGaps(cells);  // NOTE: Only takes cells param
    const suggestions = generateSuggestions(gaps);

    return NextResponse.json({
      product,
      markets,
      cells,
      gaps,
      suggestions,
    });
  } catch (error) {
    console.error("[coverage] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
