import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Image, FlaskConical, Plus, Pencil } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import EditablePageName from "@/components/pages/EditablePageName";
import EditableTags from "@/components/pages/EditableTags";
import AngleSelector from "@/components/pages/AngleSelector";
import TranslationPanel from "@/components/pages/TranslationPanel";
import ImportProgressPanel from "@/components/pages/ImportProgressPanel";
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

  // Recover stuck "publishing" or "translating" translations (stale > 10 min)
  const STALE_MS = 10 * 60 * 1000;
  const stuckTranslations = (p.translations ?? []).filter(
    (t) =>
      (t.status === "publishing" || t.status === "translating") &&
      Date.now() - new Date(t.updated_at).getTime() > STALE_MS
  );
  if (stuckTranslations.length > 0) {
    await Promise.all(
      stuckTranslations.map((t) =>
        db
          .from("translations")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", t.id)
          .in("status", ["publishing", "translating"])
      )
    );
    // Update local data to reflect the recovery
    for (const t of stuckTranslations) {
      t.status = "error";
    }
  }

  // Fetch linked concepts (image jobs pointing to this page)
  const { data: linkedConcepts } = await db
    .from("image_jobs")
    .select("id, name, concept_number, status, updated_at")
    .eq("landing_page_id", id)
    .order("updated_at", { ascending: false });

  // Fetch A/B tests using any translation of this page
  const translationIds = (p.translations ?? []).map((t) => t.id);
  const { data: linkedTests } =
    translationIds.length > 0
      ? await db
          .from("ab_tests")
          .select("id, name, language, status, updated_at")
          .or(
            `control_id.in.(${translationIds.join(",")}),variant_id.in.(${translationIds.join(",")})`
          )
          .order("updated_at", { ascending: false })
      : { data: [] as never[] };

  const hasRelated =
    (linkedConcepts && linkedConcepts.length > 0) ||
    (linkedTests && linkedTests.length > 0);

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link
        href="/pages"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Landing Pages
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
            {p.source_language && p.source_language !== "en" && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                Source: {LANGUAGES.find((l) => l.value === p.source_language)?.label ?? p.source_language.toUpperCase()}
              </span>
            )}
            <span className="text-xs font-mono text-gray-400">/{p.slug}</span>
          </div>
          <div className="mt-2">
            <EditableTags entityId={p.id} entityType="page" initialTags={p.tags ?? []} />
          </div>
          <div className="mt-2">
            <AngleSelector pageId={p.id} initialAngle={p.angle ?? "neutral"} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.status !== "importing" && (
            <Link
              href={`/pages/${p.id}/edit/source`}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-3 py-2 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Source
            </Link>
          )}
          {p.source_url && (
            <a
              href={p.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-3 py-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Source page
            </a>
          )}
        </div>
      </div>

      {/* Importing state — show progress panel */}
      {p.status === "importing" && p.swipe_job_id ? (
        <ImportProgressPanel swipeJobId={p.swipe_job_id} pageId={p.id} />
      ) : (
        <>
          {/* Translation cards */}
          <TranslationPanel
            pageId={p.id}
            languages={LANGUAGES.filter((lang) => lang.domain)}
            translations={p.translations ?? []}
            imagesToTranslate={p.images_to_translate}
            sourceLanguage={p.source_language || "en"}
          />

          {/* Image editing hint */}
          <p className="text-xs text-gray-400 mt-6">
            Click &quot;Edit Source&quot; to replace images, or edit a language version to translate images.
          </p>
        </>
      )}

      {/* Related concepts & A/B tests */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Related</h2>
          <Link
            href={`/ab-tests/new?pageId=${p.id}`}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create A/B Test
          </Link>
        </div>

        {hasRelated ? (
          <div className="space-y-2">
            {(linkedConcepts ?? []).map((concept) => (
              <Link
                key={concept.id}
                href={`/images/${concept.id}`}
                className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors group"
              >
                <Image className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">
                    {concept.concept_number
                      ? `#${concept.concept_number} `
                      : ""}
                    {concept.name}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    concept.status === "completed"
                      ? "bg-emerald-50 text-emerald-600"
                      : concept.status === "processing"
                        ? "bg-blue-50 text-blue-600"
                        : concept.status === "failed"
                          ? "bg-red-50 text-red-600"
                          : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {concept.status}
                </span>
              </Link>
            ))}

            {(linkedTests ?? []).map((test) => (
              <Link
                key={test.id}
                href={`/ab-tests/${test.id}`}
                className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors group"
              >
                <FlaskConical className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{test.name}</p>
                </div>
                <span className="text-xs text-gray-400 uppercase">
                  {test.language}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    test.status === "active"
                      ? "bg-emerald-50 text-emerald-600"
                      : test.status === "completed"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {test.status}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-2">
            No linked concepts or A/B tests yet.
          </p>
        )}
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
