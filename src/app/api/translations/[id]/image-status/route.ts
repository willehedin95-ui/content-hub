import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

/**
 * Lightweight polling endpoint for background image translation progress.
 * Returns { image_status, images_done, images_total }.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid translation ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("translations")
    .select("image_status, images_done, images_total")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  return NextResponse.json({
    image_status: data.image_status,
    images_done: data.images_done ?? 0,
    images_total: data.images_total ?? 0,
  });
}
