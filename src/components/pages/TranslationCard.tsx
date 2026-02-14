"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Globe,
  Upload,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { Translation, Language, LANGUAGES, TranslationStatus } from "@/types";
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

export default function TranslationCard({
  pageId,
  language,
  translation,
}: {
  pageId: string;
  language: (typeof LANGUAGES)[number];
  translation?: Translation;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"translate" | "publish" | null>(null);
  const [error, setError] = useState("");

  const status: TranslationStatus | "none" = translation?.status ?? "none";
  const canTranslate = !["translating", "publishing"].includes(status);
  const canPublish =
    status === "translated" || status === "published" || status === "error";

  async function handleTranslate() {
    setLoading("translate");
    setError("");

    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, language: language.value }),
    });

    const data = await res.json();
    setLoading(null);

    if (!res.ok) {
      setError(data.error || "Translation failed");
      return;
    }

    router.refresh();
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

  return (
    <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{language.flag}</span>
          <div>
            <p className="text-slate-200 font-medium text-sm">{language.label}</p>
            <p className="text-slate-500 text-xs">{language.domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusDot status={status} />
          <span className="text-xs text-slate-400">{STATUS_LABELS[status]}</span>
        </div>
      </div>

      {/* SEO preview if translated */}
      {translation?.seo_title && (
        <div className="mb-4 bg-[#0a0c14] rounded-lg px-4 py-3 border border-[#1e2130]">
          <p className="text-xs text-slate-500 mb-1">SEO Title</p>
          <p className="text-slate-300 text-sm leading-snug">
            {translation.seo_title}
          </p>
        </div>
      )}

      {/* Published URL */}
      {translation?.published_url && (
        <a
          href={translation.published_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 mb-4 truncate"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          {translation.published_url}
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-xs mb-3 bg-red-500/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {/* Row 1: Translate (full width) */}
        <button
          onClick={handleTranslate}
          disabled={!canTranslate || loading !== null}
          className="w-full flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-xs font-medium px-3 py-2 rounded-lg border border-indigo-500/20 transition-colors"
        >
          {loading === "translate" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Globe className="w-3.5 h-3.5" />
          )}
          {loading === "translate"
            ? "Translating…"
            : translation
            ? "Re-translate"
            : "Translate"}
        </button>

        {/* Row 2: Edit + Publish (only when translation exists) */}
        {translation && (
          <div className="flex gap-2">
            <Link
              href={`/pages/${pageId}/edit/${language.value}`}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg border border-slate-600/30 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
            <button
              onClick={handlePublish}
              disabled={!canPublish || loading !== null}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 text-xs font-medium px-3 py-2 rounded-lg border border-emerald-500/20 transition-colors"
            >
              {loading === "publish" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {loading === "publish" ? "Publishing…" : "Publish"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
