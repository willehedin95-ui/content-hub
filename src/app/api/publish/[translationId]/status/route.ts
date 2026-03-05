import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ translationId: string }> }
) {
  const { translationId } = await params;

  if (!isValidUUID(translationId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("translations")
    .select("status, published_url, publish_error, publish_step")
    .eq("id", translationId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    published_url: data.published_url,
    publish_error: data.publish_error,
    publish_step: data.publish_step,
  });
}
