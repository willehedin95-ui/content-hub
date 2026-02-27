import { NextRequest, NextResponse } from "next/server";
import { killConcept } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { imageJobId, notes } = await req.json();
    if (!imageJobId) {
      return NextResponse.json({ error: "imageJobId is required" }, { status: 400 });
    }
    await killConcept(imageJobId, notes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Pipeline Kill] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to kill concept" },
      { status: 500 }
    );
  }
}
