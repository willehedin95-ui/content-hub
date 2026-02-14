"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Upload,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { Translation, LANGUAGES } from "@/types";

interface Props {
  pageId: string;
  pageName: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  originalMap: Record<string, string>;
}

export default function EditPageClient({
  pageId,
  pageName,
  translation,
  language,
  originalMap,
}: Props) {
  const router = useRouter();

  const [texts, setTexts] = useState<Record<string, string>>(
    (translation.translated_texts as Record<string, string>) ?? {}
  );
  const [seoTitle, setSeoTitle] = useState(translation.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(translation.seo_description ?? "");

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Search & highlight state
  const [search, setSearch] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // All segments sorted numerically, filtering out very short/empty originals
  const allSegments = Object.entries(originalMap)
    .filter(([, orig]) => orig.trim().length > 3)
    .sort(([a], [b]) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  // Apply search filter across both original and translated text
  const filteredSegments = search.trim()
    ? allSegments.filter(([id, orig]) => {
        const q = search.toLowerCase();
        return (
          orig.toLowerCase().includes(q) ||
          (texts[id] ?? "").toLowerCase().includes(q)
        );
      })
    : allSegments;

  // Listen for click events from the preview iframe
  const jumpToSegment = useCallback(
    (clickedText: string) => {
      // Match against translated text first, then original
      const match =
        allSegments.find(([id]) => (texts[id] ?? "") === clickedText) ??
        allSegments.find(([, orig]) => orig === clickedText) ??
        allSegments.find(([id]) =>
          (texts[id] ?? "").toLowerCase().includes(clickedText.toLowerCase().slice(0, 30))
        );

      if (!match) return;
      const [id] = match;

      // Clear search so the segment is visible, then highlight + scroll
      setSearch("");
      setHighlightedId(id);
      setTimeout(() => {
        segmentRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      setTimeout(() => setHighlightedId(null), 2500);
    },
    [allSegments, texts]
  );

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "cc-segment" && typeof e.data.text === "string") {
        jumpToSegment(e.data.text);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [jumpToSegment]);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);

    const res = await fetch(`/api/translations/${translation.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translated_texts: texts,
        seo_title: seoTitle || undefined,
        seo_description: seoDesc || undefined,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setSaveError(data.error || "Failed to save");
      return;
    }
    setSaved(true);
    setIframeKey((k) => k + 1);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handlePublish() {
    setPublishing(true);
    setSaveError("");

    const saveRes = await fetch(`/api/translations/${translation.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translated_texts: texts,
        seo_title: seoTitle || undefined,
        seo_description: seoDesc || undefined,
      }),
    });

    if (!saveRes.ok) {
      const data = await saveRes.json();
      setSaveError(data.error || "Failed to save before publish");
      setPublishing(false);
      return;
    }

    const pubRes = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translation_id: translation.id }),
    });

    setPublishing(false);
    if (!pubRes.ok) {
      const data = await pubRes.json();
      setSaveError(data.error || "Publish failed");
      return;
    }

    router.push(`/pages/${pageId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0c14]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2130] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/pages/${pageId}`}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-slate-600 shrink-0">/</span>
          <span className="text-slate-400 text-sm truncate">{pageName}</span>
          <span className="text-slate-600 shrink-0">/</span>
          <span className="flex items-center gap-1.5 text-slate-200 text-sm font-medium shrink-0">
            {language.flag} {language.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || publishing}
            className="flex items-center gap-1.5 bg-[#141620] hover:bg-[#1e2130] disabled:opacity-50 text-slate-200 text-sm font-medium px-4 py-2 rounded-lg border border-[#1e2130] transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || publishing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {publishing ? "Publishing…" : "Save & Publish"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border-b border-red-500/20 px-6 py-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Preview pane */}
        <div className="flex flex-col w-1/2 border-r border-[#1e2130]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2130] shrink-0">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Preview
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600">Click any text to jump to it →</span>
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>
          <iframe
            key={iframeKey}
            src={`/api/preview/${translation.id}`}
            className="flex-1 w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
            title="Translation preview"
          />
        </div>

        {/* Editor pane */}
        <div className="flex flex-col w-1/2 min-h-0">
          {/* SEO fields */}
          <div className="px-4 py-3 border-b border-[#1e2130] shrink-0 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SEO</p>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Page title…"
              className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <textarea
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
              placeholder="Meta description…"
              rows={2}
              className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Search bar */}
          <div className="px-4 py-2 border-b border-[#1e2130] shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${allSegments.length} text segments…`}
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 placeholder-slate-600 rounded-lg pl-9 pr-8 py-2 text-xs focus:outline-none focus:border-indigo-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {search && (
              <p className="text-xs text-slate-500 mt-1">
                {filteredSegments.length} match{filteredSegments.length !== 1 ? "es" : ""}
              </p>
            )}
          </div>

          {/* Segments list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1e2130]">
            {/* Column headers */}
            <div className="grid grid-cols-2 gap-3 px-4 py-2 bg-[#0e1018] sticky top-0 z-10">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Original (EN)</span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{language.flag} {language.label}</span>
            </div>

            {filteredSegments.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-12">
                {search ? "No segments match your search." : "No text segments found. Re-translate first."}
              </p>
            )}

            {filteredSegments.map(([segId, originalText]) => (
              <div
                key={segId}
                id={`segment-${segId}`}
                ref={(el) => { segmentRefs.current[segId] = el; }}
                className={`px-4 py-3 grid grid-cols-2 gap-3 transition-colors duration-300 ${
                  highlightedId === segId
                    ? "bg-indigo-500/20 border-l-2 border-indigo-400"
                    : "hover:bg-[#141620]"
                }`}
              >
                <div className="text-xs text-slate-500 leading-relaxed pt-0.5 line-clamp-5">
                  {originalText}
                </div>
                <textarea
                  value={texts[segId] ?? ""}
                  onChange={(e) =>
                    setTexts((prev) => ({ ...prev, [segId]: e.target.value }))
                  }
                  rows={Math.max(2, Math.ceil(originalText.length / 45))}
                  className={`bg-[#0a0c14] border rounded-lg px-3 py-2 text-xs resize-y focus:outline-none leading-relaxed text-slate-200 transition-colors ${
                    highlightedId === segId
                      ? "border-indigo-400 focus:border-indigo-400"
                      : "border-[#1e2130] focus:border-indigo-500"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
