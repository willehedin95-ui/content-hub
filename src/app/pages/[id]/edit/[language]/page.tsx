import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { extractContent } from "@/lib/html-parser";
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

  // Fetch page
  const { data: page, error: pError } = await db
    .from("pages")
    .select("id, name, slug, source_url, original_html")
    .eq("id", id)
    .single();

  if (pError || !page) notFound();

  // Extract original texts from original HTML
  const { texts: originalTexts, alts: originalAlts } = extractContent(
    page.original_html
  );

  // Merge texts + alts into a single array for display
  const originalMap: Record<string, string> = {};
  for (const { id: tid, text } of originalTexts) originalMap[tid] = text;
  for (const { id: tid, alt } of originalAlts) originalMap[tid] = alt;

  return (
    <EditPageClient
      pageId={id}
      pageName={page.name}
      translation={translation}
      language={lang}
      originalMap={originalMap}
    />
  );
}
