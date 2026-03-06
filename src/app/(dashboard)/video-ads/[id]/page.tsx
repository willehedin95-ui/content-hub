import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import VideoJobDetail from "@/components/video-ads/VideoJobDetail";

export const dynamic = "force-dynamic";

export default async function VideoJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*), video_shots(*)")
    .eq("id", id)
    .single();

  if (error || !job) notFound();

  return <VideoJobDetail initialJob={job} />;
}
