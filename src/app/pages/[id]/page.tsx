import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import TranslationCard from "@/components/pages/TranslationCard";
import { Page, Translation, LANGUAGES, PRODUCTS, PAGE_TYPES } from "@/types";

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

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{p.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs bg-[#1e2130] text-slate-400 px-2.5 py-1 rounded-full">
              {PRODUCTS.find((pr) => pr.value === p.product)?.label}
            </span>
            <span className="text-xs bg-[#1e2130] text-slate-400 px-2.5 py-1 rounded-full capitalize">
              {PAGE_TYPES.find((t) => t.value === p.page_type)?.label}
            </span>
            <span className="text-xs font-mono text-slate-500">/{p.slug}</span>
          </div>
        </div>
        <a
          href={p.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 border border-[#1e2130] hover:border-indigo-500/30 rounded-lg px-3 py-2 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Source page
        </a>
      </div>

      {/* Translation cards */}
      <div>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
          Translations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {LANGUAGES.map((lang) => {
            const translation = p.translations?.find(
              (t) => t.language === lang.value
            );
            return (
              <TranslationCard
                key={lang.value}
                pageId={p.id}
                language={lang}
                translation={translation}
              />
            );
          })}
        </div>
      </div>

      {/* Meta info */}
      <div className="mt-8 border-t border-[#1e2130] pt-6">
        <p className="text-xs text-slate-600">
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
