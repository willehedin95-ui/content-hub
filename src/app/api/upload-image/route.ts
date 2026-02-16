import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

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

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    const filePath = `${translationId}/${crypto.randomUUID()}.${ext}`;

    const db = createServerSupabase();

    const { error: uploadError } = await db.storage
      .from("translated-images")
      .upload(filePath, buffer, {
        contentType: file.type || "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage
      .from("translated-images")
      .getPublicUrl(filePath);

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Image upload failed",
      },
      { status: 500 }
    );
  }
}
