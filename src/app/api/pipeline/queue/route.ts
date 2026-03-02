import { NextRequest, NextResponse } from "next/server";
import { queueConcept, unqueueConcept } from "@/lib/pipeline";

/** Add a concept to the queue */
export async function POST(req: NextRequest) {
  try {
    const { imageJobMarketId } = await req.json();
    if (!imageJobMarketId) {
      return NextResponse.json({ error: "imageJobMarketId is required" }, { status: 400 });
    }

    const result = await queueConcept(imageJobMarketId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Queue error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to queue concept" },
      { status: 500 }
    );
  }
}

/** Remove a concept from the queue */
export async function DELETE(req: NextRequest) {
  try {
    const { imageJobMarketId } = await req.json();
    if (!imageJobMarketId) {
      return NextResponse.json({ error: "imageJobMarketId is required" }, { status: 400 });
    }

    await unqueueConcept(imageJobMarketId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Unqueue error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unqueue concept" },
      { status: 500 }
    );
  }
}
