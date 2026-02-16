import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { ABTest, Translation, LANGUAGES } from "@/types";
import ABTestManager from "@/components/pages/ABTestManager";

export const dynamic = "force-dynamic";

export default async function ABTestPage({
  params,
}: {
  params: Promise<{ id: string; language: string }>;
}) {
  const { id, language: langValue } = await params;
  const db = createServerSupabase();

  const lang = LANGUAGES.find((l) => l.value === langValue);
  if (!lang) notFound();

  // Fetch the page
  const { data: page, error: pErr } = await db
    .from("pages")
    .select("id, name, slug")
    .eq("id", id)
    .single();

  if (pErr || !page) notFound();

  // Fetch the A/B test for this page+language
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select("*")
    .eq("page_id", id)
    .eq("language", langValue)
    .single();

  if (tErr || !test) notFound();

  const abTest = test as ABTest;

  // Fetch both translations in parallel
  const [{ data: controlTranslation }, { data: variantTranslation }] =
    await Promise.all([
      db.from("translations").select("*").eq("id", abTest.control_id).single(),
      db.from("translations").select("*").eq("id", abTest.variant_id).single(),
    ]);

  if (!controlTranslation || !variantTranslation) notFound();

  return (
    <ABTestManager
      pageId={id}
      pageName={page.name}
      language={lang}
      abTest={abTest}
      control={controlTranslation as Translation}
      variant={variantTranslation as Translation}
    />
  );
}
