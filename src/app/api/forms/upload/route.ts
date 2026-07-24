// Public: file upload for form submissions (e.g. bildbevis in Kontakta oss).
// Stores in the public form-uploads bucket under an unguessable uuid path and
// returns the public URL, which the submit payload then references.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";

export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB (bucket enforces the same cap)
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400, headers: cors });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil hittades" }, { status: 400, headers: cors });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Filen är för stor (max 25 MB)" }, { status: 400, headers: cors });
  }
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "Filtypen stöds inte. Ladda upp en bild (JPG/PNG/WEBP/HEIC) eller PDF." },
      { status: 400, headers: cors }
    );
  }

  const ext = EXT_BY_MIME[mime] ?? "bin";
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const path = `${month}/${randomUUID()}.${ext}`;

  const supabase = createServerSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from("form-uploads")
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (uploadErr) {
    console.error(`[forms/upload] Storage upload failed: ${uploadErr.message}`);
    return NextResponse.json(
      { error: "Uppladdningen misslyckades. Försök igen." },
      { status: 500, headers: cors }
    );
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const url = `${base}/storage/v1/object/public/form-uploads/${path}`;
  return NextResponse.json({ ok: true, url, filename: file.name.slice(0, 200) }, { headers: cors });
}
