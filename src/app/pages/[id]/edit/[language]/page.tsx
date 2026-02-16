import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { LANGUAGES } from "@/types";
import EditPageClient from "./EditPageClient";

export default async function EditTranslationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; language: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id, language } = await params;
  const { variant } = await searchParams;
  const db = createServerSupabase();

  const lang = LANGUAGES.find((l) => l.value === language);
  if (!lang) notFound();

  // Fetch translation — filter by variant if editing variant B
  let query = db
    .from("translations")
    .select("*")
    .eq("page_id", id)
    .eq("language", language);

  if (variant === "b") {
    query = query.eq("variant", "b");
  } else {
    query = query.neq("variant", "b");
  }

  const { data: translation, error: tError } = await query.single();

  if (tError || !translation) notFound();

  // Fetch page name and slug
  const { data: page, error: pError } = await db
    .from("pages")
    .select("id, name, slug")
    .eq("id", id)
    .single();

  if (pError || !page) notFound();

  return (
    <EditPageClient
      pageId={id}
      pageName={page.name}
      pageSlug={page.slug}
      translation={translation}
      language={lang}
      variantLabel={variant === "b" ? "Variant B" : undefined}
    />
  );
}
