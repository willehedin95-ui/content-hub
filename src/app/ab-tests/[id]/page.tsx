import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { ABTest, Translation, LANGUAGES } from "@/types";
import ABTestManager from "@/components/pages/ABTestManager";

export const dynamic = "force-dynamic";

export default async function ABTestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  // Fetch the AB test
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select("*")
    .eq("id", id)
    .single();

  if (tErr || !test) notFound();

  const abTest = test as ABTest;
  const lang = LANGUAGES.find((l) => l.value === abTest.language);
  if (!lang) notFound();

  // Fetch both translations with their page info
  const [{ data: controlTranslation }, { data: variantTranslation }] =
    await Promise.all([
      db
        .from("translations")
        .select("*, pages (id, name, slug)")
        .eq("id", abTest.control_id)
        .single(),
      db
        .from("translations")
        .select("*, pages (id, name, slug)")
        .eq("id", abTest.variant_id)
        .single(),
    ]);

  if (!controlTranslation || !variantTranslation) notFound();

  return (
    <ABTestManager
      testName={abTest.name}
      testSlug={abTest.slug}
      language={lang}
      abTest={abTest}
      control={controlTranslation as Translation & { pages: { id: string; name: string; slug: string } }}
      variant={variantTranslation as Translation & { pages: { id: string; name: string; slug: string } }}
    />
  );
}
