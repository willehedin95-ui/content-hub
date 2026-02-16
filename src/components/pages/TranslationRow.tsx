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
} from "lucide-react";
import Link from "next/link";
import { Translation, LANGUAGES, TranslationStatus } from "@/types";
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

export default function TranslationRow({
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
  const [copied, setCopied] = useState(false);

  const status: TranslationStatus | "none" = translation?.status ?? "none";
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

  function handleCopyUrl() {
    if (!translation?.published_url) return;
    navigator.clipboard.writeText(translation.published_url);
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
      </div>
    );
  }

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
          <StatusDot status={status} />
          <span className="text-xs text-slate-400">{STATUS_LABELS[status]}</span>
        </div>

        {/* Published URL + copy */}
        <div className="flex-1 min-w-0">
          {translation.published_url ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 truncate">
                {translation.published_url.replace(/^https?:\/\//, "")}
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
          <Link
            href={`/pages/${pageId}/edit/${language.value}`}
            className="flex items-center gap-1.5 bg-slate-700/40 hover:bg-slate-700/70 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-600/30 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
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
