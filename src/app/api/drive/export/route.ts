import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createDriveFolder, uploadToDrive } from "@/lib/google-drive";
import { LANGUAGES } from "@/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { jobId } = (await req.json()) as { jobId: string };

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*))`)
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.source_folder_id) {
    return NextResponse.json({ error: "No source folder linked" }, { status: 400 });
  }

  try {
    let exportedCount = 0;

    for (const lang of job.target_languages) {
      const langLabel = LANGUAGES.find((l: { value: string }) => l.value === lang)?.label ?? lang;
      const langFolderId = await createDriveFolder(job.source_folder_id, langLabel);

      for (const si of job.source_images ?? []) {
        for (const t of si.image_translations ?? []) {
          if (t.language === lang && t.status === "completed" && t.translated_url) {
            try {
              const imgRes = await fetch(t.translated_url);
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              const filename = si.filename || `${si.id}.png`;
              await uploadToDrive(langFolderId, filename, buffer, "image/png");
              exportedCount++;
            } catch (err) {
              console.error(`Failed to export ${si.filename}/${lang}:`, err);
            }
          }
        }
      }
    }

    // Mark job as exported
    await db
      .from("image_jobs")
      .update({ exported_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({ exported: exportedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
