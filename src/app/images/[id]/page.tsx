import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-admin";
import { asStringArray } from "@/lib/utils";
import ImageJobDetail from "@/components/images/ImageJobDetail";

export const dynamic = "force-dynamic";

export default async function ImageJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ iterate?: string; market?: string; perf?: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  // Try with versions join first, fall back to without if versions table doesn't exist
  let { data: job, error } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*, versions(*)))`)
    .eq("id", id)
    .single();

  if (error && error.message?.includes("versions")) {
    const fallback = await db
      .from("image_jobs")
      .select(`*, source_images(*, image_translations(*))`)
      .eq("id", id)
      .single();
    job = fallback.data;
    error = fallback.error;
  }

  if (error || !job) notFound();

  // Compute counts
  const allTranslations = job.source_images?.flatMap(
    (si: { image_translations?: { status: string }[] }) => si.image_translations ?? []
  ) ?? [];

  const enriched = {
    ...job,
    // jsonb columns can hold a stray non-array from a bad write; normalize so
    // downstream `.some/.map` on the client never throws (audit 2026-07-07).
    ad_copy_primary: asStringArray(job.ad_copy_primary),
    ad_copy_headline: asStringArray(job.ad_copy_headline),
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter((t: { status: string }) => t.status === "completed").length,
    failed_translations: allTranslations.filter((t: { status: string }) => t.status === "failed").length,
  };

  const { iterate, market, perf } = await searchParams;

  return <ImageJobDetail initialJob={enriched} autoIterate={iterate === "true"} iterateMarket={market} iteratePerf={perf} />;
}
