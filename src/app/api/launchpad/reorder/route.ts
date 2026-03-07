import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Support new format: { order: [{ conceptId, type }] } and legacy: { order: string[] }
  const order: Array<{ conceptId: string; type: "image" | "video" }> = Array.isArray(body.order)
    ? body.order.map((item: string | { conceptId: string; type: "image" | "video" }) =>
        typeof item === "string"
          ? { conceptId: item, type: "image" as const }
          : item
      )
    : [];

  if (order.length === 0) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  const db = createServerSupabase();

  for (let i = 0; i < order.length; i++) {
    const { conceptId, type } = order[i];
    const table = type === "video" ? "video_jobs" : "image_jobs";
    await db
      .from(table)
      .update({ launchpad_priority: i + 1 })
      .eq("id", conceptId);
  }

  return NextResponse.json({ success: true });
}
