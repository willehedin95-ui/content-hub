import { NextRequest, NextResponse } from "next/server";
import { checkImageTaskStatus } from "@/lib/kie";
import { createServerSupabase } from "@/lib/supabase";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 60;

/**
 * GET /api/video-swiper/status?tasks=taskId1,taskId2&product=happysleep
 *
 * Polls Kie.ai for each task's status. When a task completes, downloads the
 * video and stores it in Supabase Storage, returning the public URL.
 */
export async function GET(req: NextRequest) {
  const tasksParam = req.nextUrl.searchParams.get("tasks");
  const product = req.nextUrl.searchParams.get("product") || "happysleep";

  if (!tasksParam) {
    return NextResponse.json({ error: "tasks parameter is required" }, { status: 400 });
  }

  const taskIds = tasksParam.split(",").filter(Boolean);
  if (taskIds.length === 0) {
    return NextResponse.json({ error: "No task IDs provided" }, { status: 400 });
  }

  const db = createServerSupabase();
  const results: Array<{
    task_id: string;
    status: "processing" | "completed" | "failed";
    video_url: string | null;
    error: string | null;
  }> = [];

  for (const taskId of taskIds) {
    try {
      const status = await checkImageTaskStatus(taskId);

      if (status.status === "completed" && status.urls.length > 0) {
        // Download and store the video
        const videoResponse = await fetch(status.urls[0]);
        if (videoResponse.ok) {
          const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          const storagePath = `${product}/video-swiper/${taskId}.mp4`;

          const { error: uploadError } = await db.storage
            .from(VIDEO_STORAGE_BUCKET)
            .upload(storagePath, videoBuffer, {
              contentType: "video/mp4",
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrl } = db.storage
              .from(VIDEO_STORAGE_BUCKET)
              .getPublicUrl(storagePath);

            results.push({
              task_id: taskId,
              status: "completed",
              video_url: `${publicUrl.publicUrl}?v=${Date.now()}`,
              error: null,
            });
          } else {
            // Upload failed but video was generated — return Kie.ai URL directly
            results.push({
              task_id: taskId,
              status: "completed",
              video_url: status.urls[0],
              error: null,
            });
          }
        } else {
          results.push({
            task_id: taskId,
            status: "completed",
            video_url: status.urls[0],
            error: null,
          });
        }
      } else if (status.status === "failed") {
        results.push({
          task_id: taskId,
          status: "failed",
          video_url: null,
          error: status.errorMessage || "Generation failed",
        });
      } else {
        results.push({
          task_id: taskId,
          status: "processing",
          video_url: null,
          error: null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        task_id: taskId,
        status: "processing",
        video_url: null,
        error: msg,
      });
    }
  }

  const allDone = results.every((r) => r.status === "completed" || r.status === "failed");
  const anyFailed = results.some((r) => r.status === "failed");

  return NextResponse.json({
    overall: allDone ? (anyFailed ? "failed" : "completed") : "processing",
    tasks: results,
  });
}
