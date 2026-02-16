"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Globe,
  Upload,
  Pencil,
  Copy,
  Check,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { Translation, ABTest, LANGUAGES, TranslationStatus } from "@/types";
import StatusDot from "@/components/dashboard/StatusDot";

const STATUS_LABELS: Record<TranslationStatus | "none", string> = {
  none: "Not started",
  draft: "Draft",
  translating: "Translating…",
  translated: "Translated",
  publishing: "Publishing…",
  published: "Published",
  error: "Error",
};

const AB_STATUS_LABELS: Record<string, string> = {
  draft: "A/B Draft",
  active: "A/B Active",
  completed: "A/B Completed",
};

export default function TranslationRow({
  pageId,
  language,
  translation,
  abTest,
}: {
  pageId: string;
  language: (typeof LANGUAGES)[number];
  translation?: Translation;
  abTest?: ABTest;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"translate" | "publish" | "ab" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const status: TranslationStatus | "none" = translation?.status ?? "none";
  const canPublish =
    status === "translated" || status === "published" || status === "error";
  const hasActiveTest = abTest && abTest.status !== "completed";

  async function handleTranslate() {
    setLoading("translate");
    setError("");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, language: language.value }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Translation failed");
        return;
      }

      router.refresh();
    } catch {
      setError("Translation failed — check your connection and try again");
    } finally {
      setLoading(null);
    }
  }

  async function handlePublish() {
    if (!translation?.id) return;
    setLoading("publish");
    setError("");

    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translation_id: translation.id }),
    });

    const data = await res.json();
    setLoading(null);

    if (!res.ok) {
      setError(data.error || "Publish failed");
      return;
    }

    router.refresh();
  }

  async function handleCreateABTest() {
    if (!translation?.id) return;
    setLoading("ab");
    setError("");

    const res = await fetch("/api/ab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translation_id: translation.id }),
    });

    const data = await res.json();
    setLoading(null);

    if (!res.ok) {
      if (res.status === 409 && data.id) {
        // Test already exists, navigate to it
        router.push(`/pages/${pageId}/ab-test/${language.value}`);
        return;
      }
      setError(data.error || "Failed to create A/B test");
      return;
    }

    router.push(`/pages/${pageId}/ab-test/${language.value}`);
  }

  function handleCopyUrl() {
    const url = abTest?.router_url || translation?.published_url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Not started — show translate button
  if (!translation) {
    return (
      <div className="bg-[#141620] border border-[#1e2130] rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">{language.flag}</span>
            <div>
              <p className="text-slate-200 font-medium text-sm">{language.label}</p>
              <p className="text-slate-600 text-[10px]">{language.domain}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <StatusDot status="none" />
              <span className="text-xs text-slate-500">Not started</span>
            </div>
            <button
              onClick={handleTranslate}
              disabled={loading !== null}
              className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 disabled:opacity-40 text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-colors"
            >
              {loading === "translate" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              {loading === "translate" ? "Translating…" : "Translate"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 text-red-400 text-xs mt-2 bg-red-500/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  const displayUrl = abTest?.router_url || translation.published_url;

  // Has translation — show full row
  return (
    <div className="bg-[#141620] border border-[#1e2130] rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Language info */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg">{language.flag}</span>
          <div>
            <p className="text-slate-200 font-medium text-sm">{language.label}</p>
            <p className="text-slate-600 text-[10px]">{language.domain}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasActiveTest ? (
            <>
              <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-amber-400">
                {AB_STATUS_LABELS[abTest.status] ?? abTest.status}
              </span>
            </>
          ) : (
            <>
              <StatusDot status={status} />
              <span className="text-xs text-slate-400">{STATUS_LABELS[status]}</span>
            </>
          )}
        </div>

        {/* Published URL + copy */}
        <div className="flex-1 min-w-0">
          {displayUrl ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 truncate">
                {displayUrl.replace(/^https?:\/\//, "")}
              </span>
              <button
                onClick={handleCopyUrl}
                className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-600">Not published</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {hasActiveTest ? (
            <Link
              href={`/pages/${pageId}/ab-test/${language.value}`}
              className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Manage Test
            </Link>
          ) : (
            <>
              <Link
                href={`/pages/${pageId}/edit/${language.value}`}
                className="flex items-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-600/30 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Link>
              <button
                onClick={handleCreateABTest}
                disabled={loading !== null || !canPublish}
                className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors"
                title="Create A/B test"
              >
                {loading === "ab" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="w-3.5 h-3.5" />
                )}
                A/B
              </button>
              <button
                onClick={handlePublish}
                disabled={!canPublish || loading !== null}
                className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-500/20 transition-colors"
              >
                {loading === "publish" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {loading === "publish" ? "Publishing…" : "Publish"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-xs mt-2 bg-red-500/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
