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

  const errors: string[] = [];

  try {
    let exportedCount = 0;

    for (const lang of job.target_languages) {
      const langLabel = LANGUAGES.find((l: { value: string }) => l.value === lang)?.label ?? lang;

      let langFolderId: string;
      try {
        langFolderId = await createDriveFolder(job.source_folder_id, langLabel);
      } catch (err) {
        const msg = `Failed to create folder "${langLabel}": ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg);
        errors.push(msg);
        continue;
      }

      for (const si of job.source_images ?? []) {
        for (const t of si.image_translations ?? []) {
          if (t.language === lang && t.status === "completed" && t.translated_url) {
            try {
              const imgRes = await fetch(t.translated_url);
              if (!imgRes.ok) {
                throw new Error(`HTTP ${imgRes.status} fetching image`);
              }
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              if (buffer.length < 1000) {
                throw new Error(`Image too small (${buffer.length} bytes) — likely an error response`);
              }
              const filename = si.filename || `${si.id}.png`;
              await uploadToDrive(langFolderId, filename, buffer, "image/png");
              exportedCount++;
            } catch (err) {
              const msg = `${si.filename ?? si.id}/${lang}: ${err instanceof Error ? err.message : String(err)}`;
              console.error(`Export file failed:`, msg);
              errors.push(msg);
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

    return NextResponse.json({
      exported: exportedCount,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    console.error("Drive export top-level error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed", errors },
      { status: 500 }
    );
  }
}
