"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import { Language, LANGUAGES, AdCopyJob, AdCopyTranslation } from "@/types";

function getDefaultLanguages(): Language[] {
  try {
    const stored = localStorage.getItem("content-hub-settings");
    if (stored) {
      const settings = JSON.parse(stored);
      if (settings.static_ads_default_languages?.length) {
        return settings.static_ads_default_languages;
      }
    }
  } catch {}
  return ["sv", "da", "no", "de"];
}

export default function AdCopyPage() {
  const [name, setName] = useState(
    `Ad Copy - ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
  );
  const [sourceText, setSourceText] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(
    () => new Set(getDefaultLanguages())
  );
  const [job, setJob] = useState<AdCopyJob | null>(null);
  const [translating, setTranslating] = useState(false);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function toggleLanguage(lang: Language) {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      return next;
    });
  }

  async function handleTranslate() {
    if (!sourceText.trim() || selectedLanguages.size === 0) return;
    setTranslating(true);
    setJob(null);

    try {
      // Create the job
      const res = await fetch("/api/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          source_text: sourceText.trim(),
          target_languages: Array.from(selectedLanguages),
        }),
      });

      if (!res.ok) throw new Error("Failed to create job");
      const created: AdCopyJob = await res.json();
      setJob(created);

      // Translate all languages in parallel
      const translations = created.ad_copy_translations ?? [];
      await Promise.all(
        translations.map(async (t) => {
          try {
            const tRes = await fetch("/api/ad-copy/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ translationId: t.id }),
            });
            const result = await tRes.json();

            setJob((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                ad_copy_translations: prev.ad_copy_translations?.map((tr) =>
                  tr.id === t.id
                    ? {
                        ...tr,
                        translated_text: result.translated_text ?? tr.translated_text,
                        status: tRes.ok ? "completed" : "failed",
                        error_message: tRes.ok ? null : result.error,
                      }
                    : tr
                ),
              };
            });
          } catch {
            setJob((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                ad_copy_translations: prev.ad_copy_translations?.map((tr) =>
                  tr.id === t.id
                    ? { ...tr, status: "failed", error_message: "Network error" }
                    : tr
                ),
              };
            });
          }
        })
      );
    } catch (err) {
      console.error("Translation error:", err);
    } finally {
      setTranslating(false);
    }
  }

  async function handleAnalyze(translationId: string) {
    setAnalyzing((prev) => new Set(prev).add(translationId));
    try {
      const res = await fetch("/api/ad-copy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationId }),
      });
      const result = await res.json();
      if (res.ok) {
        setJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ad_copy_translations: prev.ad_copy_translations?.map((tr) =>
              tr.id === translationId
                ? {
                    ...tr,
                    quality_score: result.quality_score,
                    quality_analysis: result,
                  }
                : tr
            ),
          };
        });
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(translationId);
        return next;
      });
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Ad Copy Translation</h1>
        <p className="text-gray-500 text-sm mt-1">
          Translate ad copy text to multiple languages with quality analysis
        </p>
      </div>

      {/* Input section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Job name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border border-gray-300 text-gray-800 placeholder-gray-400 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Source text (English)
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={6}
            placeholder="Paste your English ad copy here..."
            className="w-full bg-white border border-gray-300 text-gray-800 placeholder-gray-400 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-2">
            Target languages
          </label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => {
              const selected = selectedLanguages.has(lang.value);
              return (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => toggleLanguage(lang.value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    selected
                      ? "bg-indigo-50 border-indigo-300 text-indigo-600"
                      : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <span className="text-base">{lang.flag}</span>
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleTranslate}
          disabled={translating || !sourceText.trim() || selectedLanguages.size === 0}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {translating && <Loader2 className="w-4 h-4 animate-spin" />}
          {translating ? "Translating..." : "Translate"}
        </button>
      </div>

      {/* Results */}
      {job?.ad_copy_translations && job.ad_copy_translations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Results
          </h2>
          {job.ad_copy_translations.map((t) => (
            <TranslationCard
              key={t.id}
              translation={t}
              sourceText={sourceText}
              analyzing={analyzing.has(t.id)}
              copiedId={copiedId}
              onAnalyze={() => handleAnalyze(t.id)}
              onCopy={(text) => handleCopy(text, t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TranslationCard({
  translation: t,
  sourceText,
  analyzing,
  copiedId,
  onAnalyze,
  onCopy,
}: {
  translation: AdCopyTranslation;
  sourceText: string;
  analyzing: boolean;
  copiedId: string | null;
  onAnalyze: () => void;
  onCopy: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lang = LANGUAGES.find((l) => l.value === t.language);
  const isCompleted = t.status === "completed";
  const isFailed = t.status === "failed";
  const isProcessing = t.status === "processing" || t.status === "pending";

  const scoreColor =
    t.quality_score != null
      ? t.quality_score >= 80
        ? "text-green-600 bg-green-50"
        : t.quality_score >= 60
          ? "text-amber-600 bg-amber-50"
          : "text-red-600 bg-red-50"
      : "";

  const analysis = t.quality_analysis as {
    overall_assessment?: string;
    accuracy_issues?: string[];
    grammar_issues?: string[];
    tone_issues?: string[];
  } | null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base">{lang?.flag}</span>
          <span className="text-sm font-medium text-gray-700">
            {lang?.label ?? t.language}
          </span>
          {isProcessing && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
          )}
          {isFailed && (
            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              Failed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {t.quality_score != null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${scoreColor}`}>
              {t.quality_score}/100
            </span>
          )}
          {isCompleted && !t.quality_score && (
            <button
              onClick={onAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <BarChart3 className="w-3 h-3" />
              )}
              Analyze
            </button>
          )}
          {isCompleted && t.translated_text && (
            <button
              onClick={() => onCopy(t.translated_text!)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              {copiedId === t.id ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copiedId === t.id ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
            Original
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{sourceText}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
            Translation
          </p>
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Translating...
            </div>
          )}
          {isFailed && (
            <p className="text-sm text-red-500">{t.error_message ?? "Translation failed"}</p>
          )}
          {isCompleted && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {t.translated_text}
            </p>
          )}
        </div>
      </div>

      {/* Quality analysis details */}
      {analysis && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 w-full px-5 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            Quality details
          </button>
          {expanded && (
            <div className="px-5 pb-4 space-y-2">
              {analysis.overall_assessment && (
                <p className="text-xs text-gray-600">
                  {analysis.overall_assessment}
                </p>
              )}
              {analysis.accuracy_issues && analysis.accuracy_issues.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                    Accuracy Issues
                  </p>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {analysis.accuracy_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.grammar_issues && analysis.grammar_issues.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                    Grammar Issues
                  </p>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {analysis.grammar_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.tone_issues && analysis.tone_issues.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                    Tone Issues
                  </p>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {analysis.tone_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
