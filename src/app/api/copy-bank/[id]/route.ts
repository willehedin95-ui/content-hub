import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

// DELETE /api/copy-bank/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { error } = await db
    .from("copy_bank")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return safeError(error, "Failed to delete copy bank entry");

  return NextResponse.json({ ok: true });
}
