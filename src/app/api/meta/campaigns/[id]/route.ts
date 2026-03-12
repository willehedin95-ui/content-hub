import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const workspaceId = await getWorkspaceId();
  const { data, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
