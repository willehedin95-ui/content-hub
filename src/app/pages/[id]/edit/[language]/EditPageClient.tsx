"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Upload,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Smartphone,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { Translation, LANGUAGES } from "@/types";
import ImageTranslatePanel from "@/components/pages/ImageTranslatePanel";

interface Props {
  pageId: string;
  pageName: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel?: string;
}

export default function EditPageClient({
  pageId,
  pageName,
  translation,
  language,
  variantLabel,
}: Props) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [seoTitle, setSeoTitle] = useState(translation.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(translation.seo_description ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [clickedImage, setClickedImage] = useState<{
    src: string;
    index: number;
    width: number;
    height: number;
  } | null>(null);

  // Listen for messages from the iframe editor
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "cc-dirty") {
        setIsDirty(true);
      }
      if (e.data?.type === "cc-image-click") {
        setClickedImage({
          src: e.data.src,
          index: e.data.index,
          width: e.data.width,
          height: e.data.height,
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function extractHtmlFromIframe(): string {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) {
      throw new Error("Cannot access iframe document");
    }
    const doc = iframe.contentDocument;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;

    // Strip editor artifacts
    clone.querySelectorAll("[data-cc-editor]").forEach((el) => el.remove());
    clone
      .querySelectorAll("[data-cc-injected]")
      .forEach((el) => el.remove());
    clone.querySelectorAll("[data-cc-editable]").forEach((el) => {
      el.removeAttribute("data-cc-editable");
      el.removeAttribute("contenteditable");
    });
    clone.querySelectorAll("[contenteditable]").forEach((el) => {
      el.removeAttribute("contenteditable");
    });
    // Strip image translation highlights
    clone.querySelectorAll("[data-cc-img-highlight]").forEach((el) => {
      (el as HTMLElement).style.outline = "";
      el.removeAttribute("data-cc-img-highlight");
    });

    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);

    try {
      const html = extractHtmlFromIframe();

      const res = await fetch(`/api/translations/${translation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translated_html: html,
          seo_title: seoTitle || undefined,
          seo_description: seoDesc || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Failed to save");
        return;
      }

      setSaved(true);
      setIsDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setSaveError("");

    try {
      const html = extractHtmlFromIframe();

      const saveRes = await fetch(`/api/translations/${translation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translated_html: html,
          seo_title: seoTitle || undefined,
          seo_description: seoDesc || undefined,
        }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        setSaveError(data.error || "Failed to save before publish");
        return;
      }

      const pubRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translation.id }),
      });

      if (!pubRes.ok) {
        const data = await pubRes.json();
        setSaveError(data.error || "Publish failed");
        return;
      }

      router.push(`/pages/${pageId}`);
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Publish failed"
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleRetranslate() {
    if (isDirty && !confirm("This will discard your unsaved changes and re-translate from the original. Continue?")) return;
    setRetranslating(true);
    setSaveError("");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, language: language.value }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Re-translation failed");
        return;
      }

      setIsDirty(false);
      setIframeKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Re-translation failed"
      );
    } finally {
      setRetranslating(false);
    }
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
          {variantLabel && (
            <>
              <span className="text-slate-600 shrink-0">/</span>
              <span className="text-xs font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded shrink-0">
                {variantLabel}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleRetranslate}
            disabled={saving || publishing || retranslating}
            className="flex items-center gap-1.5 bg-[#141620] hover:bg-[#1e2130] disabled:opacity-50 text-slate-400 text-sm font-medium px-3 py-2 rounded-lg border border-[#1e2130] transition-colors"
          >
            {retranslating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            {retranslating ? "Translating…" : "Re-translate"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || publishing || retranslating}
            className="flex items-center gap-1.5 bg-[#141620] hover:bg-[#1e2130] disabled:opacity-50 text-slate-200 text-sm font-medium px-4 py-2 rounded-lg border border-[#1e2130] transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || publishing || retranslating}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {publishing ? "Publishing..." : "Save & Publish"}
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
        {/* Preview / editing pane */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2130] shrink-0">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Click any text to edit
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#141620] rounded-lg border border-[#1e2130] p-0.5">
                <button
                  onClick={() => setViewMode("desktop")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                    viewMode === "desktop"
                      ? "bg-[#1e2130] text-slate-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setViewMode("mobile")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                    viewMode === "mobile"
                      ? "bg-[#1e2130] text-slate-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => {
                  if (isDirty && !confirm("You have unsaved changes. Reload preview?")) return;
                  setIframeKey((k) => k + 1);
                  setIsDirty(false);
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>
          <div className={`flex-1 overflow-auto ${viewMode === "mobile" ? "flex justify-center bg-[#141620]" : ""}`}>
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={`/api/preview/${translation.id}`}
              className={`bg-white h-full ${
                viewMode === "mobile"
                  ? "w-[375px] border-x border-[#1e2130] shadow-2xl"
                  : "w-full"
              }`}
              sandbox="allow-scripts allow-same-origin"
              title="Translation editor"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-[#1e2130] shrink-0 flex flex-col overflow-y-auto">
          {/* SEO fields */}
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              SEO
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Page Title
              </label>
              <input
                value={seoTitle}
                onChange={(e) => {
                  setSeoTitle(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Page title..."
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Meta Description
              </label>
              <textarea
                value={seoDesc}
                onChange={(e) => {
                  setSeoDesc(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Meta description..."
                rows={4}
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1e2130]" />

          {/* Image translation */}
          <ImageTranslatePanel
            iframeRef={iframeRef}
            translationId={translation.id}
            language={language}
            clickedImage={clickedImage}
            onClickedImageClear={() => setClickedImage(null)}
            onImageReplaced={() => setIsDirty(true)}
          />
        </div>
      </div>
    </div>
  );
}
