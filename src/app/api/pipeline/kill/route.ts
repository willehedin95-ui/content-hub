import { NextRequest, NextResponse } from "next/server";
import { killConcept } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { imageJobMarketId, notes } = await req.json();
    if (!imageJobMarketId) {
      return NextResponse.json({ error: "imageJobMarketId is required" }, { status: 400 });
    }
    await killConcept(imageJobMarketId, notes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Pipeline Kill] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to kill concept" },
      { status: 500 }
    );
  }
}
