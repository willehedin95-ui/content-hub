import { NextRequest, NextResponse } from "next/server";
import { queueConcept, unqueueConcept } from "@/lib/pipeline";

/** Add a concept to the queue */
export async function POST(req: NextRequest) {
  try {
    const { imageJobId } = await req.json();
    if (!imageJobId) {
      return NextResponse.json({ error: "imageJobId is required" }, { status: 400 });
    }

    const result = await queueConcept(imageJobId);
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
    const { imageJobId } = await req.json();
    if (!imageJobId) {
      return NextResponse.json({ error: "imageJobId is required" }, { status: 400 });
    }

    await unqueueConcept(imageJobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Unqueue error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unqueue concept" },
      { status: 500 }
    );
  }
}
