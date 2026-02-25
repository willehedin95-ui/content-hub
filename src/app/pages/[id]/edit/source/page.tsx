import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { LANGUAGES, Translation } from "@/types";
import EditPageClient from "../[language]/EditPageClient";

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: page, error } = await db
    .from("pages")
    .select("id, name, slug, product, original_html, source_language")
    .eq("id", id)
    .single();

  if (error || !page) notFound();

  if (!page.original_html) notFound();

  const sourceLang = page.source_language || "en";
  const lang = LANGUAGES.find((l) => l.value === sourceLang) || {
    value: "sv" as const,
    label: "English (Source)",
    flag: "🇬🇧",
    domain: "",
  };

  // Build a synthetic translation object so EditPageClient can render the HTML
  const syntheticTranslation: Translation = {
    id: `source_${page.id}`,
    page_id: page.id,
    language: lang.value as Translation["language"],
    variant: "a",
    translated_html: page.original_html,
    translated_texts: null,
    seo_title: null,
    seo_description: null,
    slug: page.slug,
    status: "translated",
    published_url: null,
    quality_score: null,
    quality_analysis: null,
    image_status: null,
    images_done: 0,
    images_total: 0,
    publish_error: null,
    created_at: "",
    updated_at: "",
  };

  return (
    <EditPageClient
      pageId={id}
      pageName={page.name}
      pageSlug={page.slug}
      pageProduct={page.product}
      originalHtml={page.original_html}
      translation={syntheticTranslation}
      language={lang}
      isSource
    />
  );
}
