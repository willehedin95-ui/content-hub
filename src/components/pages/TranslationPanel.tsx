"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { Translation, ABTest, LANGUAGES, PageImageSelection } from "@/types";
import TranslationRow from "./TranslationRow";

interface Props {
  pageId: string;
  languages: (typeof LANGUAGES)[number][];
  translations: Translation[];
  abTests: ABTest[];
  imagesToTranslate?: PageImageSelection[];
}

export default function TranslationPanel({ pageId, languages, translations, abTests, imagesToTranslate }: Props) {
  const router = useRouter();
  const [translatingAll, setTranslatingAll] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const abTestMap = new Map(abTests.map((t) => [t.language, t]));

  const untranslatedLangs = languages.filter((lang) => {
    const t = translations.find((tr) => tr.language === lang.value && tr.variant !== "b");
    return !t || t.status === "draft";
  });

  async function handleTranslateAll() {
    const confirmed = window.confirm(
      `Translate ${untranslatedLangs.length} language${untranslatedLangs.length > 1 ? "s" : ""}? This will use OpenAI API credits.`
    );
    if (!confirmed) return;

    setTranslatingAll(true);
    const langs = untranslatedLangs;
    setProgress({ done: 0, total: langs.length });

    const promises = langs.map(async (lang) => {
      try {
        await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_id: pageId, language: lang.value }),
        });
      } finally {
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
    });

    await Promise.allSettled(promises);
    setTranslatingAll(false);
    router.refresh();
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
            />
          );
        })}
      </div>
    </div>
  );
}
