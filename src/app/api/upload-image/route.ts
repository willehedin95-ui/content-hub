import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { validateMediaFile, isValidUUID } from "@/lib/validation";
import { STORAGE_BUCKET } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const translationId = formData.get("translationId") as string | null;

  if (!file || !translationId) {
    return NextResponse.json(
      { error: "file and translationId are required" },
      { status: 400 }
    );
  }

  // Validate the storage prefix: must be a real translation (or the
  // "source_<pageId>" editor variant) in the active workspace - previously
  // any string became a storage folder (audit 2026-07-07, P2 storage).
  const isSource = translationId.startsWith("source_");
  const realId = isSource ? translationId.slice("source_".length) : translationId;
  if (!isValidUUID(realId)) {
    return NextResponse.json({ error: "Invalid translationId" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (isSource) {
    const { data: page } = await db
      .from("pages")
      .select("id")
      .eq("id", realId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
  } else {
    const { data: trans } = await db
      .from("translations")
      .select("id, pages!inner(workspace_id)")
      .eq("id", realId)
      .eq("pages.workspace_id", workspaceId)
      .maybeSingle();
    if (!trans) {
      return NextResponse.json({ error: "Translation not found" }, { status: 404 });
    }
  }

  const validation = validateMediaFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${translationId}/${crypto.randomUUID()}.${validation.ext}`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || (validation.isVideo ? "video/mp4" : "image/png"),
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return NextResponse.json({
      imageUrl: urlData.publicUrl,
      isVideo: validation.isVideo,
    });
  } catch (error) {
    console.error("Media upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
