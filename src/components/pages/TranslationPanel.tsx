"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Translation, ABTest, LANGUAGES, PageImageSelection } from "@/types";
import TranslationRow from "./TranslationRow";
import { getPageQualitySettings } from "@/lib/settings";

interface Props {
  pageId: string;
  languages: (typeof LANGUAGES)[number][];
  translations: Translation[];
  abTests: ABTest[];
  imagesToTranslate?: PageImageSelection[];
}

const STUCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export default function TranslationPanel({ pageId, languages, translations, abTests, imagesToTranslate }: Props) {
  const router = useRouter();
  const [translatingAll, setTranslatingAll] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [stuckWarning, setStuckWarning] = useState(false);
  const stuckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Register translate functions from each row (for Phase 2 callback ref pattern)
  const translateFns = useRef<Map<string, () => Promise<void>>>(new Map());

  const registerTranslate = useCallback((langValue: string, fn: () => Promise<void>) => {
    translateFns.current.set(langValue, fn);
  }, []);

  const unregisterTranslate = useCallback((langValue: string) => {
    translateFns.current.delete(langValue);
  }, []);

  // Cleanup stuck timer on unmount
  useEffect(() => {
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, []);

  const abTestMap = new Map(abTests.map((t) => [t.language, t]));

  const untranslatedLangs = languages.filter((lang) => {
    const t = translations.find((tr) => tr.language === lang.value && tr.variant !== "b");
    return !t || t.status === "draft";
  });

  function computeTotalEstimate(langCount: number): string {
    const settings = getPageQualitySettings();
    const imageCount = imagesToTranslate?.length ?? 0;
    const perLangSeconds = 15 + (settings.enabled ? 8 : 0) + imageCount * 20;
    // Languages run sequentially to avoid rate limits
    const totalSeconds = perLangSeconds * langCount;
    if (totalSeconds < 60) return `~${totalSeconds}s`;
    const mins = Math.ceil(totalSeconds / 60);
    return `~${mins} min`;
  }

  async function handleTranslateAll() {
    // Use registered row functions if available (Phase 2 pattern)
    const rowFns: (() => Promise<void>)[] = [];
    for (const lang of untranslatedLangs) {
      const fn = translateFns.current.get(lang.value);
      if (fn) rowFns.push(fn);
    }

    if (rowFns.length > 0) {
      // Phase 2 path: trigger each row's full translate pipeline
      const estimate = computeTotalEstimate(rowFns.length);
      const confirmed = window.confirm(
        `Translate ${rowFns.length} language${rowFns.length > 1 ? "s" : ""}? This includes text, quality analysis, and images.\n\nEstimated time: ${estimate}`
      );
      if (!confirmed) return;

      setTranslatingAll(true);
      setStuckWarning(false);
      setProgress({ done: 0, total: rowFns.length });

      // Start stuck timer
      stuckTimerRef.current = setTimeout(() => setStuckWarning(true), STUCK_TIMEOUT_MS);

      // Run sequentially to avoid OpenAI rate limits and Vercel concurrency limits
      for (const fn of rowFns) {
        try {
          await fn();
        } finally {
          setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      }
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      setTranslatingAll(false);
      setStuckWarning(false);
      router.refresh();
      // Delayed second refresh to catch late DB updates
      setTimeout(() => router.refresh(), 5000);
      return;
    }

    // Fallback: raw API calls (legacy path)
    const confirmed = window.confirm(
      `Translate ${untranslatedLangs.length} language${untranslatedLangs.length > 1 ? "s" : ""}? This will use API credits.`
    );
    if (!confirmed) return;

    setTranslatingAll(true);
    setStuckWarning(false);
    const langs = untranslatedLangs;
    setProgress({ done: 0, total: langs.length });

    // Start stuck timer
    stuckTimerRef.current = setTimeout(() => setStuckWarning(true), STUCK_TIMEOUT_MS);

    // Run sequentially to avoid rate limits
    for (const lang of langs) {
      try {
        await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_id: pageId, language: lang.value }),
        });
      } finally {
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
    }
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    setTranslatingAll(false);
    setStuckWarning(false);
    router.refresh();
    // Delayed second refresh to catch late DB state updates
    setTimeout(() => router.refresh(), 5000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Translations
        </h2>
        {untranslatedLangs.length > 0 && !translatingAll && (
          <button
            onClick={handleTranslateAll}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            Translate All ({untranslatedLangs.length})
          </button>
        )}
      </div>

      {translatingAll && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 mb-3">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          <span className="text-sm text-indigo-700">
            Translating {progress.done}/{progress.total} languages...
          </span>
        </div>
      )}

      {stuckWarning && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">
              This is taking longer than expected. Some translations may have timed out.
            </span>
          </div>
          <button
            onClick={() => {
              setTranslatingAll(false);
              setStuckWarning(false);
              if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
              router.refresh();
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      )}

      <div className="space-y-2">
        {languages.map((lang) => {
          const translation = translations.find(
            (t) => t.language === lang.value && t.variant !== "b"
          );
          return (
            <TranslationRow
              key={lang.value}
              pageId={pageId}
              language={lang}
              translation={translation}
              abTest={abTestMap.get(lang.value)}
              imagesToTranslate={imagesToTranslate}
              onRegisterTranslate={(fn) => registerTranslate(lang.value, fn)}
              onUnregisterTranslate={() => unregisterTranslate(lang.value)}
            />
          );
        })}
      </div>
    </div>
  );
}
