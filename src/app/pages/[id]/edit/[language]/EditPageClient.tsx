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
  Monitor,
  Smartphone,
  Globe,
  MoveHorizontal,
  MoveVertical,
  MousePointerClick,
  Link2,
} from "lucide-react";

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
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [padDH, setPadDH] = useState(""); // desktop horizontal
  const [padDV, setPadDV] = useState(""); // desktop vertical
  const [padMH, setPadMH] = useState(""); // mobile horizontal
  const [padMV, setPadMV] = useState(""); // mobile vertical
  const [excludeMode, setExcludeMode] = useState(false);
  const [excludeCount, setExcludeCount] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const prevLinkUrl = useRef("");
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

  // Clean up saved-indicator timeout on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // Ctrl/Cmd+S keyboard shortcut for save
  const saveRef = useRef<(() => void) | null>(null);
  saveRef.current = () => {
    if (!saving && !publishing && !retranslating) handleSave();
  };
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Exclude mode: intercept clicks in iframe to toggle data-cc-pad-skip
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    if (!excludeMode) return;

    // Inject temporary visual style for exclude mode
    const style = doc.createElement("style");
    style.setAttribute("data-cc-exclude-mode", "true");
    style.textContent = [
      "[data-cc-padded]:hover { outline: 2px dashed rgba(245,158,11,0.6) !important; outline-offset: 2px; cursor: pointer !important; }",
      "[data-cc-pad-skip] { outline: 2px dashed rgba(239,68,68,0.7) !important; outline-offset: 2px; }",
      "[data-cc-pad-skip]:hover { outline: 2px solid rgba(239,68,68,0.9) !important; }",
    ].join("\n");
    doc.head.appendChild(style);

    function handleClick(e: Event) {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      // Find the nearest padded element
      const padded = target.closest("[data-cc-padded]") as HTMLElement | null;
      if (!padded) return;

      if (padded.hasAttribute("data-cc-pad-skip")) {
        padded.removeAttribute("data-cc-pad-skip");
      } else {
        padded.setAttribute("data-cc-pad-skip", "");
      }
      setExcludeCount(doc!.querySelectorAll("[data-cc-pad-skip]").length);
      setIsDirty(true);
    }

    doc.addEventListener("click", handleClick, true);

    return () => {
      doc!.removeEventListener("click", handleClick, true);
      style.remove();
    };
  }, [excludeMode]);

  // Build CSS with media queries — only targets elements marked with data-cc-padded
  function buildPaddingCss(dh: string, dv: string, mh: string, mv: string): string {
    const rules: string[] = [];

    // Desktop rules (viewport > 375px)
    const dhVal = dh !== "" ? parseInt(dh) : null;
    const dvVal = dv !== "" ? parseInt(dv) : null;
    if (dhVal !== null || dvVal !== null) {
      const inner: string[] = [];
      if (dhVal !== null) inner.push(`[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${dhVal}px !important; padding-right: ${dhVal}px !important; }`);
      if (dvVal !== null) inner.push(`body { padding-top: ${dvVal}px !important; padding-bottom: ${dvVal}px !important; }`);
      rules.push(`@media (min-width: 376px) {\n  ${inner.join("\n  ")}\n}`);
    }

    // Mobile rules (viewport <= 375px)
    const mhVal = mh !== "" ? parseInt(mh) : null;
    const mvVal = mv !== "" ? parseInt(mv) : null;
    if (mhVal !== null || mvVal !== null) {
      const inner: string[] = [];
      if (mhVal !== null) inner.push(`[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${mhVal}px !important; padding-right: ${mhVal}px !important; }`);
      if (mvVal !== null) inner.push(`body { padding-top: ${mvVal}px !important; padding-bottom: ${mvVal}px !important; }`);
      rules.push(`@media (max-width: 375px) {\n  ${inner.join("\n  ")}\n}`);
    }

    return rules.join("\n");
  }

  // Mark elements with significant padding and detect values on iframe load
  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const body = doc.body;
    if (!body) return;
    const win = doc.defaultView;
    if (!win) return;

    // Always mark elements with significant horizontal padding (>= 16px)
    // so CSS targeting [data-cc-padded] works
    const SKIP_TAGS = ["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "BR", "HR", "IMG"];
    const allElements = body.querySelectorAll("*");
    const limit = Math.min(allElements.length, 500);
    let maxH = 0;

    for (let i = 0; i < limit; i++) {
      const el = allElements[i] as HTMLElement;
      if (SKIP_TAGS.includes(el.tagName)) continue;
      // Skip elements already marked (from a previous save)
      if (el.hasAttribute("data-cc-padded")) {
        const cs = win.getComputedStyle(el);
        const pl = parseInt(cs.paddingLeft) || 0;
        const pr = parseInt(cs.paddingRight) || 0;
        maxH = Math.max(maxH, pl, pr);
        continue;
      }

      const cs = win.getComputedStyle(el);
      const display = cs.display;
      if (!display.includes("block") && !display.includes("flex") && !display.includes("grid")) continue;

      const pl = parseInt(cs.paddingLeft) || 0;
      const pr = parseInt(cs.paddingRight) || 0;
      const pad = Math.max(pl, pr);
      if (pad >= 16) {
        el.setAttribute("data-cc-padded", "");
        maxH = Math.max(maxH, pad);
      }
    }

    // If we already saved custom padding, restore those values
    const existing = doc.querySelector("style[data-cc-custom]");
    if (existing) {
      const dh = existing.getAttribute("data-pad-dh");
      const dv = existing.getAttribute("data-pad-dv");
      const mh = existing.getAttribute("data-pad-mh");
      const mv = existing.getAttribute("data-pad-mv");
      if (dh) setPadDH(dh);
      if (dv) setPadDV(dv);
      if (mh) setPadMH(mh);
      if (mv) setPadMV(mv);
      return;
    }

    // Pre-fill both desktop and mobile with detected values
    if (maxH > 0) {
      setPadDH(String(maxH));
      setPadMH(String(maxH));
    }

    // Count any existing excluded elements
    setExcludeCount(doc.querySelectorAll("[data-cc-pad-skip]").length);

    // Detect the most common link URL on the page
    const links = doc.querySelectorAll("a[href]");
    const urlCounts = new Map<string, number>();
    links.forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!href || href.startsWith("javascript:") || href === "#" || href.startsWith("mailto:")) return;
      urlCounts.set(href, (urlCounts.get(href) || 0) + 1);
    });
    let topUrl = "";
    let topCount = 0;
    urlCounts.forEach((count, url) => {
      if (count > topCount) { topUrl = url; topCount = count; }
    });
    if (topUrl) {
      setLinkUrl(topUrl);
      prevLinkUrl.current = topUrl;
    }
  }

  // Inject/update padding CSS in the iframe live
  function syncPaddingToIframe(dh: string, dv: string, mh: string, mv: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    let styleEl = doc.querySelector("style[data-cc-custom]");
    const css = buildPaddingCss(dh, dv, mh, mv);
    if (!css) {
      styleEl?.remove();
      return;
    }
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.setAttribute("data-cc-custom", "true");
      doc.head.appendChild(styleEl);
    }
    styleEl.setAttribute("data-pad-dh", dh);
    styleEl.setAttribute("data-pad-dv", dv);
    styleEl.setAttribute("data-pad-mh", mh);
    styleEl.setAttribute("data-pad-mv", mv);
    styleEl.textContent = css;
  }

  function handlePaddingChange(axis: "h" | "v", value: string) {
    let dh = padDH, dv = padDV, mh = padMH, mv = padMV;
    if (viewMode === "desktop") {
      if (axis === "h") { dh = value; setPadDH(value); }
      else { dv = value; setPadDV(value); }
    } else {
      if (axis === "h") { mh = value; setPadMH(value); }
      else { mv = value; setPadMV(value); }
    }
    syncPaddingToIframe(dh, dv, mh, mv);
    setIsDirty(true);
  }

  function handleLinkUrlChange(newUrl: string) {
    setLinkUrl(newUrl);
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !prevLinkUrl.current) return;
    const old = prevLinkUrl.current;
    doc.querySelectorAll("a[href]").forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      if (anchor.href === old) {
        anchor.href = newUrl;
      }
    });
    prevLinkUrl.current = newUrl;
    setIsDirty(true);
  }

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
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 3000);
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
    if (!isDirty && translation.status === "published" &&
        !confirm("This page is already published. Re-translating will overwrite the current translation. Continue?")) return;
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
          <button
            onClick={() => {
              if (isDirty && !confirm("You have unsaved changes. Leave without saving?")) return;
              router.push(`/pages/${pageId}`);
            }}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
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
            <span className={`text-xs font-medium uppercase tracking-wider ${excludeMode ? "text-amber-400" : "text-slate-400"}`}>
              {excludeMode ? "Click elements to exclude from padding" : "Click any text to edit"}
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
              onLoad={handleIframeLoad}
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
          {/* Padding */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Padding
              </p>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                {viewMode === "desktop" ? (
                  <><Monitor className="w-3 h-3" /> Desktop</>
                ) : (
                  <><Smartphone className="w-3 h-3" /> Mobile</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-1">
                <MoveHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="number"
                  min="0"
                  value={viewMode === "desktop" ? padDH : padMH}
                  onChange={(e) => handlePaddingChange("h", e.target.value)}
                  placeholder="—"
                  className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <MoveVertical className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="number"
                  min="0"
                  value={viewMode === "desktop" ? padDV : padMV}
                  onChange={(e) => handlePaddingChange("v", e.target.value)}
                  placeholder="—"
                  className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExcludeMode(!excludeMode)}
                className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                  excludeMode
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-[#141620] border-[#1e2130] text-slate-500 hover:text-slate-300"
                }`}
              >
                <MousePointerClick className="w-3 h-3" />
                Exclude{excludeCount > 0 ? ` (${excludeCount})` : ""}
              </button>
              <span className="text-[10px] text-slate-600">
                {viewMode === "desktop" ? "Desktop" : "Mobile"} view
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1e2130]" />

          {/* Destination URL */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Destination URL
            </p>
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => handleLinkUrlChange(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 truncate"
              />
            </div>
            <p className="text-[10px] text-slate-600">
              Applied to all links on the page.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1e2130]" />

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
