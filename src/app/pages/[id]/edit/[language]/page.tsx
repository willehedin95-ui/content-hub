import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { LANGUAGES } from "@/types";
import EditPageClient from "./EditPageClient";

export default async function EditTranslationPage({
  params,
}: {
  params: Promise<{ id: string; language: string }>;
}) {
  const { id, language } = await params;
  const db = createServerSupabase();

  const lang = LANGUAGES.find((l) => l.value === language);
  if (!lang) notFound();

  // Fetch translation
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("*")
    .eq("page_id", id)
    .eq("language", language)
    .single();

  if (tError || !translation) notFound();

  // Fetch page name
  const { data: page, error: pError } = await db
    .from("pages")
    .select("id, name")
    .eq("id", id)
    .single();

  if (pError || !page) notFound();

  return (
    <EditPageClient
      pageId={id}
      pageName={page.name}
      translation={translation}
      language={lang}
    />
  );
}
