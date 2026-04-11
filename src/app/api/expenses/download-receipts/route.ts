import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const person = formData.get("person") as string || "William";
  const month = formData.get("month") as string || "";

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const zip = new JSZip();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    // Clean filename: 01_Shopify_2026-04.pdf
    const idx = String(i + 1).padStart(2, "0");
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    zip.file(`${idx}_${cleanName}`, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const filename = `Kvitton ${person} ${month}.zip`;

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
