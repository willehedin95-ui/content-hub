import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const body = await req.json();
  const { name } = body as { name?: string };

  if (!name) {
    return NextResponse.json(
      { error: "Missing required field: name" },
      { status: 400 }
    );
  }

  const { data: updated, error } = await db
    .from("saved_components")
    .update({ name })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update component");
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Fetch record to get thumbnail_url for cleanup
  const { data: record, error: fetchError } = await db
    .from("saved_components")
    .select("thumbnail_url")
    .eq("id", id)
    .single();

  if (fetchError) {
    return safeError(fetchError, "Component not found", 404);
  }

  // Delete thumbnail from storage if it exists
  if (record?.thumbnail_url) {
    try {
      const url = new URL(record.thumbnail_url);
      // Path format: /storage/v1/object/public/component-thumbnails/thumb_xxx.png
      const pathParts = url.pathname.split("/");
      const filename = pathParts[pathParts.length - 1];
      if (filename) {
        await db.storage.from("component-thumbnails").remove([filename]);
      }
    } catch (err) {
      console.error(
        "[saved-components] Failed to delete thumbnail:",
        err instanceof Error ? err.message : err
      );
      // Continue with record deletion even if storage cleanup fails
    }
  }

  // Delete the DB record
  const { error: deleteError } = await db
    .from("saved_components")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return safeError(deleteError, "Failed to delete component");
  }

  return NextResponse.json({ ok: true });
}
