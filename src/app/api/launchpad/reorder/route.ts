import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { order } = await req.json(); // string[] of imageJobIds in desired order
  if (!order || !Array.isArray(order)) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  const db = createServerSupabase();

  for (let i = 0; i < order.length; i++) {
    await db
      .from("image_jobs")
      .update({ launchpad_priority: i + 1 })
      .eq("id", order[i]);
  }

  return NextResponse.json({ success: true });
}
