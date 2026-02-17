import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import TranslationRow from "@/components/pages/TranslationRow";
import EditablePageName from "@/components/pages/EditablePageName";
import { Page, Translation, ABTest, LANGUAGES, PRODUCTS, PAGE_TYPES } from "@/types";

export const dynamic = "force-dynamic";

export default async function PageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: page, error } = await db
    .from("pages")
    .select(`*, translations (*)`)
    .eq("id", id)
    .single();

  if (error || !page) notFound();

  const p = page as Page & { translations: Translation[] };

  // Fetch A/B tests for this page
  const { data: abTests } = await db
    .from("ab_tests")
    .select("*")
    .eq("page_id", id);

  const abTestMap = new Map(
    (abTests ?? []).map((t: ABTest) => [t.language, t])
  );

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <EditablePageName pageId={p.id} initialName={p.name} />
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              {PRODUCTS.find((pr) => pr.value === p.product)?.label}
            </span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full capitalize">
              {PAGE_TYPES.find((t) => t.value === p.page_type)?.label}
            </span>
            <span className="text-xs font-mono text-gray-400">/{p.slug}</span>
          </div>
        </div>
        <a
          href={p.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-3 py-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Source page
        </a>
      </div>

      {/* Translation cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Translations
        </h2>
        <div className="space-y-2">
          {LANGUAGES.map((lang) => {
            const translation = p.translations?.find(
              (t) => t.language === lang.value && t.variant !== "b"
            );
            return (
              <TranslationRow
                key={lang.value}
                pageId={p.id}
                language={lang}
                translation={translation}
                abTest={abTestMap.get(lang.value)}
              />
            );
          })}
        </div>
      </div>

      {/* Meta info */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <p className="text-xs text-gray-400">
          Imported{" "}
          {new Date(p.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
