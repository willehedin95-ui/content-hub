import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import ImageJobDetail from "@/components/images/ImageJobDetail";

export const dynamic = "force-dynamic";

export default async function ImageJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*))`)
    .eq("id", id)
    .single();

  if (error || !job) notFound();

  // Compute counts
  const allTranslations = job.source_images?.flatMap(
    (si: { image_translations?: { status: string }[] }) => si.image_translations ?? []
  ) ?? [];

  const enriched = {
    ...job,
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter((t: { status: string }) => t.status === "completed").length,
    failed_translations: allTranslations.filter((t: { status: string }) => t.status === "failed").length,
  };

  return <ImageJobDetail initialJob={enriched} />;
}
