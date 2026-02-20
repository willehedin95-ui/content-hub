import { ImageJob, SourceImage } from "@/types";

export function computeCounts(job: ImageJob & { source_images: SourceImage[] }) {
  const allTranslations =
    job.source_images?.flatMap((si) => si.image_translations ?? []) ?? [];
  return {
    ...job,
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter(
      (t) => t.status === "completed"
    ).length,
    failed_translations: allTranslations.filter(
      (t) => t.status === "failed"
    ).length,
  };
}
