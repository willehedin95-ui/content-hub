import Link from "next/link";
import {
  Zap,
  FlaskConical,
  Image,
  Layers,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import { LANGUAGES } from "@/types";
import { getDashboardStep } from "@/lib/concept-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = createServerSupabase();

  // Fetch all data in parallel
  const [pagesResult, conceptsResult, abTestsResult] = await Promise.all([
    db
      .from("pages")
      .select("id, name, product, translations (id, language, status)")
      .order("created_at", { ascending: false }),
    db
      .from("image_jobs")
      .select(
        "id, name, concept_number, status, completed_translations, total_translations, ad_copy_primary, landing_page_id, marked_ready_at, updated_at, meta_campaigns (id, status)"
      )
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(20),
    db
      .from("ab_tests")
      .select("id, name, language, status, split, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  const pages = pagesResult.data ?? [];
  const concepts = conceptsResult.data ?? [];
  const abTests = abTestsResult.data ?? [];

  // Pages needing attention: pages with error or untranslated languages
  const publishableLanguages = LANGUAGES.filter((l) => l.domain);
  const pagesNeedingAttention = pages
    .map((page) => {
      const translations = (page.translations ?? []) as Array<{
        id: string;
        language: string;
        status: string;
      }>;
      const errors = translations.filter((t) => t.status === "error");
      const missing = publishableLanguages.filter(
        (l) => !translations.some((t) => t.language === l.value)
      );
      if (errors.length === 0 && missing.length === 0) return null;
      return { ...page, errors, missing };
    })
    .filter(Boolean)
    .slice(0, 5);

  // Concept status breakdown
  const conceptsByStep = {
    images: concepts.filter((c) => getDashboardStep(c) === "images"),
    "ad-copy": concepts.filter((c) => getDashboardStep(c) === "ad-copy"),
    preview: concepts.filter(
      (c) => getDashboardStep(c) === "preview" || getDashboardStep(c) === "ready"
    ),
    published: concepts.filter((c) => getDashboardStep(c) === "published"),
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your content pipeline
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Link
          href="/pages"
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Landing Pages
            </span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {pages.length}
          </p>
        </Link>

        <Link
          href="/images"
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Image className="w-4 h-4 text-pink-600" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Ad Concepts
            </span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {concepts.length}
          </p>
        </Link>

        <Link
          href="/ab-tests"
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Active A/B Tests
            </span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {abTests.length}
          </p>
        </Link>

        <Link
          href="/performance"
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Performance
            </span>
          </div>
          <p className="text-sm font-medium text-gray-500 mt-1">
            View analytics
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Active A/B Tests */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Active A/B Tests
            </h2>
            <Link
              href="/ab-tests"
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              View all
            </Link>
          </div>
          {abTests.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">
              No active tests
            </p>
          ) : (
            <div className="space-y-2">
              {abTests.slice(0, 5).map((test) => {
                const lang = LANGUAGES.find((l) => l.value === test.language);
                const daysRunning = Math.floor(
                  (Date.now() - new Date(test.created_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                );
                return (
                  <Link
                    key={test.id}
                    href={`/ab-tests/${test.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors -mx-1"
                  >
                    <span className="text-sm" role="img" aria-label={lang?.label}>
                      {lang?.flag}
                    </span>
                    <span className="text-sm text-gray-700 flex-1 truncate">
                      {test.name}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {test.split}/{100 - test.split}
                    </span>
                    <span className="text-xs text-gray-400">
                      {daysRunning}d
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Concepts in Progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Concepts Pipeline
            </h2>
            <Link
              href="/images"
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {(
              [
                {
                  key: "images",
                  label: "Images",
                  color: "bg-amber-500",
                },
                {
                  key: "ad-copy",
                  label: "Ad Copy",
                  color: "bg-indigo-500",
                },
                {
                  key: "preview",
                  label: "Preview / Ready",
                  color: "bg-teal-500",
                },
                {
                  key: "published",
                  label: "Published",
                  color: "bg-emerald-500",
                },
              ] as const
            ).map(({ key, label, color }) => {
              const count =
                conceptsByStep[key as keyof typeof conceptsByStep].length;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
                  <span className="text-sm text-gray-600 flex-1">{label}</span>
                  <span className="text-sm font-medium text-gray-900 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pages Needing Attention */}
      {pagesNeedingAttention.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Pages Needing Attention
              </h2>
            </div>
            <Link
              href="/pages"
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              View all pages
            </Link>
          </div>
          <div className="space-y-2">
            {pagesNeedingAttention.map((item) => {
              if (!item) return null;
              return (
                <Link
                  key={item.id}
                  href={`/pages/${item.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors -mx-1 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">
                      {item.name}
                    </p>
                  </div>
                  {item.errors.length > 0 && (
                    <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                      {item.errors.length} error
                      {item.errors.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {item.missing.length > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {item.missing.length} untranslated
                    </span>
                  )}
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
