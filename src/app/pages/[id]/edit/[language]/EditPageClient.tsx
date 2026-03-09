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
  Eye,
  Undo2,
  Settings,
  X,
} from "lucide-react";

import { Translation, LANGUAGES, COUNTRY_MAP, MarketProductUrl, PageQualityAnalysis } from "@/types";
import ImagePanel from "@/components/pages/ImagePanel";
import PublishModal from "@/components/pages/PublishModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import PaddingControls from "@/components/pages/editor/PaddingControls";
import ElementControls from "@/components/pages/editor/ElementControls";
import PageSettingsModal from "@/components/pages/editor/PageSettingsModal";
import LayersPanel from "@/components/pages/editor/LayersPanel";

interface Props {
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct?: string;
  originalHtml: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel?: string;
  isSource?: boolean;
}

export default function EditPageClient({
  pageId,
  pageName,
  pageSlug,
  pageProduct,
  originalHtml,
  translation,
  language,
  variantLabel,
  isSource,
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
  const [padDH, setPadDH] = useState("");
  const [padDV, setPadDV] = useState("");
  const [padMH, setPadMH] = useState("");
  const [padMV, setPadMV] = useState("");
  const [excludeMode, setExcludeMode] = useState(false);
  const [excludeCount, setExcludeCount] = useState(0);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [fixingQuality, setFixingQuality] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const prevLinkUrl = useRef("");
  const [slug, setSlug] = useState(translation.slug ?? pageSlug);
  const [clickedImage, setClickedImage] = useState<{
    src: string;
    index: number;
    width: number;
    height: number;
  } | null>(null);
  const [bgImageTranslating, setBgImageTranslating] = useState(false);

  // Element-level editing
  const selectedElRef = useRef<HTMLElement | null>(null);
  const [hasSelectedEl, setHasSelectedEl] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [revealHidden, setRevealHidden] = useState(false);
  const excludeModeRef = useRef(false);
  const [layersRefreshKey, setLayersRefreshKey] = useState(0);


  // Quality analysis
  const [qualityScore, setQualityScore] = useState<number | null>(translation.quality_score ?? null);
  const [qualityAnalysis, setQualityAnalysis] = useState<PageQualityAnalysis | null>(translation.quality_analysis ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showQualityDetails, setShowQualityDetails] = useState(false);

  // Market product URLs
  const [marketUrls, setMarketUrls] = useState<MarketProductUrl[]>([]);
  const [urlMode, setUrlMode] = useState<"saved" | "custom">("custom");

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; variant: "danger" | "warning" | "default"; action: () => void } | null>(null);

  // Autosave
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveDataRef = useRef({ seoTitle: "", seoDesc: "", slug: "" });
  const savingRef = useRef(false);

  useEffect(() => { autosaveDataRef.current = { seoTitle, seoDesc, slug }; }, [seoTitle, seoDesc, slug]);
  useEffect(() => { savingRef.current = saving || publishing || retranslating; }, [saving, publishing, retranslating]);

  const triggerAutosave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      setAutoSaveStatus("saving");
      try {
        const html = extractHtmlFromIframe();
        let res: Response;
        if (isSource) {
          res = await fetch(`/api/pages/${pageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ original_html: html }),
          });
        } else {
          const d = autosaveDataRef.current;
          res = await fetch(`/api/translations/${translation.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              translated_html: html,
              seo_title: d.seoTitle || undefined,
              seo_description: d.seoDesc || undefined,
              slug: d.slug || undefined,
            }),
          });
        }
        if (res.ok) {
          setIsDirty(false);
          setAutoSaveStatus("saved");
          if (autoSavedTimeoutRef.current) clearTimeout(autoSavedTimeoutRef.current);
          autoSavedTimeoutRef.current = setTimeout(() => setAutoSaveStatus("idle"), 3000);
        } else {
          setAutoSaveStatus("idle");
        }
      } catch {
        setAutoSaveStatus("idle");
      }
    }, 3000);
  }, [translation.id, isSource, pageId]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setLayersRefreshKey((k) => k + 1);
    triggerAutosave();
  }, [triggerAutosave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSavedTimeoutRef.current) clearTimeout(autoSavedTimeoutRef.current);
    };
  }, []);

  // Fetch market product URLs
  useEffect(() => {
    fetch("/api/market-urls")
      .then((r) => (r.ok ? r.json() : []))
      .then(setMarketUrls);
  }, []);

  // Auto-detect URL mode when market URLs load and linkUrl is set
  const country = COUNTRY_MAP[language.value];
  const filteredUrls = marketUrls.filter((u) => u.country === country);

  useEffect(() => {
    if (marketUrls.length > 0 && linkUrl) {
      const match = filteredUrls.find((u) => u.url === linkUrl);
      setUrlMode(match ? "saved" : "custom");
    }
  }, [marketUrls.length, linkUrl]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "cc-dirty") {
        markDirty();
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
  }, [markDirty]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty || bgImageTranslating) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, bgImageTranslating]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

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

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    if (!excludeMode) return;

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
      const padded = target.closest("[data-cc-padded]") as HTMLElement | null;
      if (!padded) return;

      if (padded.hasAttribute("data-cc-pad-skip")) {
        padded.removeAttribute("data-cc-pad-skip");
      } else {
        padded.setAttribute("data-cc-pad-skip", "");
      }
      setExcludeCount(doc!.querySelectorAll("[data-cc-pad-skip]").length);
      markDirty();
    }

    doc.addEventListener("click", handleClick, true);

    return () => {
      doc!.removeEventListener("click", handleClick, true);
      style.remove();
    };
  }, [excludeMode]);

  useEffect(() => { excludeModeRef.current = excludeMode; }, [excludeMode]);



  function handleHideElement() {
    const el = selectedElRef.current;
    if (!el) return;
    el.setAttribute("data-cc-hidden", "");
    el.style.display = "none";
    el.removeAttribute("data-cc-selected");
    selectedElRef.current = null;
    setHasSelectedEl(false);
    const doc = iframeRef.current?.contentDocument;
    if (doc) setHiddenCount(doc.querySelectorAll("[data-cc-hidden]").length);
    markDirty();
  }

  function handleToggleLayerVisibility(el: HTMLElement) {
    if (el.hasAttribute("data-cc-hidden")) {
      el.removeAttribute("data-cc-hidden");
      el.style.display = "";
    } else {
      el.setAttribute("data-cc-hidden", "");
      el.style.display = "none";
      if (el === selectedElRef.current) {
        selectedElRef.current = null;
        setHasSelectedEl(false);
      }
    }
    const doc = iframeRef.current?.contentDocument;
    if (doc) setHiddenCount(doc.querySelectorAll("[data-cc-hidden]").length);
    markDirty();
  }

  function handleDeleteElement() {
    setConfirmAction({
      title: "Delete element",
      message: "Remove this element from the page? You can revert by reloading.",
      variant: "danger",
      action: () => {
        setConfirmAction(null);
        const el = selectedElRef.current;
        if (!el) return;
        el.remove();
        selectedElRef.current = null;
        setHasSelectedEl(false);
        markDirty();
      },
    });
  }

  function toggleRevealHidden() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const newState = !revealHidden;
    setRevealHidden(newState);
    doc.querySelectorAll("[data-cc-hidden]").forEach(el => {
      const htmlEl = el as HTMLElement;
      if (newState) {
        htmlEl.style.display = "";
        htmlEl.style.opacity = "0.2";
      } else {
        htmlEl.style.display = "none";
        htmlEl.style.opacity = "";
      }
    });
  }

  function buildPaddingCss(dh: string, dv: string, mh: string, mv: string): string {
    const rules: string[] = [];

    const dhVal = dh !== "" ? parseInt(dh) : null;
    const dvVal = dv !== "" ? parseInt(dv) : null;
    if (dhVal !== null || dvVal !== null) {
      const inner: string[] = [];
      if (dhVal !== null) inner.push(`[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${dhVal}px !important; padding-right: ${dhVal}px !important; }`);
      if (dvVal !== null) inner.push(`body { padding-top: ${dvVal}px !important; padding-bottom: ${dvVal}px !important; }`);
      rules.push(`@media (min-width: 769px) {\n  ${inner.join("\n  ")}\n}`);
    }

    const mhVal = mh !== "" ? parseInt(mh) : null;
    const mvVal = mv !== "" ? parseInt(mv) : null;
    if (mhVal !== null || mvVal !== null) {
      const inner: string[] = [];
      if (mhVal !== null) inner.push(`[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${mhVal}px !important; padding-right: ${mhVal}px !important; }`);
      if (mvVal !== null) inner.push(`body { padding-top: ${mvVal}px !important; padding-bottom: ${mvVal}px !important; }`);
      rules.push(`@media (max-width: 768px) {\n  ${inner.join("\n  ")}\n}`);
    }

    return rules.join("\n");
  }

  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const body = doc.body;
    if (!body) return;
    const win = doc.defaultView;
    if (!win) return;

    // Clean orphaned editor styles from previously-saved HTML
    doc.querySelectorAll("style[data-cc-exclude-mode]").forEach(el => el.remove());
    // Remove any style tags containing editor dashed-outline CSS (legacy saves)
    doc.querySelectorAll("style").forEach(el => {
      const css = el.textContent || "";
      if (css.includes("data-cc-pad-skip") && css.includes("dashed")) el.remove();
    });

    // Convert clean data-pad attributes (from extractHtmlFromIframe) back to
    // editor data-cc-padded so the padding controls work
    doc.querySelectorAll("[data-pad]").forEach(el => {
      el.setAttribute("data-cc-padded", "");
      el.removeAttribute("data-pad");
    });

    const SKIP_TAGS = ["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "BR", "HR", "IMG"];
    const allElements = body.querySelectorAll("*");
    const limit = Math.min(allElements.length, 500);
    let maxH = 0;

    for (let i = 0; i < limit; i++) {
      const el = allElements[i] as HTMLElement;
      if (SKIP_TAGS.includes(el.tagName)) continue;
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

    // Detect link URL, element selection, hidden count — these must run
    // regardless of padding settings (no early returns before this block)
    setExcludeCount(doc.querySelectorAll("[data-cc-pad-skip]").length);

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

    // Element selection — clear stale ref on reload
    selectedElRef.current = null;
    setHasSelectedEl(false);

    // Count existing hidden elements
    setHiddenCount(doc.querySelectorAll("[data-cc-hidden]").length);

    // Inject element selection styles
    const elStyle = doc.createElement("style");
    elStyle.setAttribute("data-cc-el-toolbar", "true");
    elStyle.textContent = "[data-cc-selected] { outline: 2px solid rgba(99,102,241,0.8) !important; outline-offset: 2px; }";

    // Restore padding settings from saved style tags
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
      // Rewrite clean selectors back to editor selectors and tag for cleanup
      existing.textContent = (existing.textContent || "")
        .replace(/\[data-pad\]/g, "[data-cc-padded]:not([data-cc-pad-skip])");
      return;
    }

    // Detect clean [data-pad] style from a previous save (no data-cc-custom attr)
    const cleanPadStyle = Array.from(doc.querySelectorAll("style")).find(
      s => (s.textContent || "").includes("[data-pad]") && !s.hasAttribute("data-cc-custom")
    );
    if (cleanPadStyle) {
      // Parse padding values from the CSS
      const css = cleanPadStyle.textContent || "";
      const dhMatch = css.match(/min-width:\s*769px\)[^}]*\[data-pad\][^{]*\{\s*padding-left:\s*(\d+)px/);
      const mhMatch = css.match(/max-width:\s*768px\)[^}]*\[data-pad\][^{]*\{\s*padding-left:\s*(\d+)px/);
      const dvMatch = css.match(/min-width:\s*769px\)[^}]*body[^{]*\{\s*padding-top:\s*(\d+)px/);
      const mvMatch = css.match(/max-width:\s*768px\)[^}]*body[^{]*\{\s*padding-top:\s*(\d+)px/);
      if (dhMatch) setPadDH(dhMatch[1]);
      if (mhMatch) setPadMH(mhMatch[1]);
      if (dvMatch) setPadDV(dvMatch[1]);
      if (mvMatch) setPadMV(mvMatch[1]);
      // Convert to editor-managed style tag
      cleanPadStyle.setAttribute("data-cc-custom", "true");
      if (dhMatch) cleanPadStyle.setAttribute("data-pad-dh", dhMatch[1]);
      if (dvMatch) cleanPadStyle.setAttribute("data-pad-dv", dvMatch[1]);
      if (mhMatch) cleanPadStyle.setAttribute("data-pad-mh", mhMatch[1]);
      if (mvMatch) cleanPadStyle.setAttribute("data-pad-mv", mvMatch[1]);
      cleanPadStyle.textContent = css.replace(/\[data-pad\]/g, "[data-cc-padded]:not([data-cc-pad-skip])");
      return;
    }

    if (maxH > 0) {
      setPadDH(String(maxH));
      setPadMH(String(maxH));
    }
    doc.head.appendChild(elStyle);

    // Click handler for element selection (bubble phase — runs after iframe script)
    doc.addEventListener("click", function (e: Event) {
      const target = (e as MouseEvent).target as HTMLElement;
      const SKIP = ["SCRIPT", "STYLE", "NOSCRIPT", "BR", "HR"];
      if (SKIP.includes(target.tagName)) return;

      // Un-hide if clicking a revealed hidden element
      if (target.closest("[data-cc-hidden]")) {
        const hidden = target.closest("[data-cc-hidden]") as HTMLElement;
        hidden.removeAttribute("data-cc-hidden");
        hidden.style.display = "";
        hidden.style.opacity = "";
        const count = doc.querySelectorAll("[data-cc-hidden]").length;
        setHiddenCount(count);
        markDirty();
        return;
      }

      // Skip images — handled by iframe image-click handler
      if (target.tagName === "IMG") return;

      // Clicking body/html — deselect
      if (target === body || target.tagName === "HTML") {
        if (selectedElRef.current) {
          selectedElRef.current.removeAttribute("data-cc-selected");
          selectedElRef.current = null;
          setHasSelectedEl(false);
        }
        return;
      }

      // Skip in exclude mode
      if (excludeModeRef.current) return;

      // Deselect previous
      if (selectedElRef.current) {
        selectedElRef.current.removeAttribute("data-cc-selected");
      }

      // Select new element (works alongside text editing — both can coexist)
      target.setAttribute("data-cc-selected", "");
      selectedElRef.current = target;
      setHasSelectedEl(true);
    }, false);
  }

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
    markDirty();
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
    markDirty();
  }

  function extractHtmlFromIframe(): string {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) {
      throw new Error("Cannot access iframe document");
    }
    const doc = iframe.contentDocument;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;

    // Remove all editor-injected elements (styles, scripts, toolbars)
    clone.querySelectorAll("[data-cc-editor]").forEach((el) => el.remove());
    clone.querySelectorAll("[data-cc-injected]").forEach((el) => el.remove());
    clone.querySelectorAll("[data-cc-el-toolbar]").forEach((el) => el.remove());
    clone.querySelectorAll("[data-cc-exclude-mode]").forEach((el) => el.remove());

    // Strip editor-only attributes
    clone.querySelectorAll("[data-cc-editable]").forEach((el) => {
      el.removeAttribute("data-cc-editable");
      el.removeAttribute("contenteditable");
    });
    clone.querySelectorAll("[contenteditable]").forEach((el) => {
      el.removeAttribute("contenteditable");
    });
    clone.querySelectorAll("[data-cc-img-highlight]").forEach((el) => {
      (el as HTMLElement).style.outline = "";
      el.removeAttribute("data-cc-img-highlight");
    });
    clone.querySelectorAll("[data-cc-selected]").forEach((el) => {
      el.removeAttribute("data-cc-selected");
    });
    // Clean padding/hide editor attributes
    // Rename data-cc-padded → data-pad (clean, non-editor attribute) for
    // elements that are NOT excluded, so the padding CSS still applies.
    clone.querySelectorAll("[data-cc-padded]").forEach((el) => {
      if (!el.hasAttribute("data-cc-pad-skip")) {
        el.setAttribute("data-pad", "");
      }
      el.removeAttribute("data-cc-padded");
    });
    clone.querySelectorAll("[data-cc-pad-skip]").forEach((el) => {
      el.removeAttribute("data-cc-pad-skip");
    });
    clone.querySelectorAll("[data-cc-hidden]").forEach((el) => {
      el.removeAttribute("data-cc-hidden");
    });

    // Rewrite the data-cc-custom style tag to use clean selectors and strip
    // any editor-only rules (dashed outlines, hover highlights)
    const customStyle = clone.querySelector("style[data-cc-custom]");
    if (customStyle) {
      let css = customStyle.textContent || "";
      // Rewrite editor selectors to clean ones
      css = css.replace(/\[data-cc-padded\]:not\(\[data-cc-pad-skip\]\)/g, "[data-pad]");
      // Remove any editor dashed outline / hover rules that leaked in
      css = css.replace(/\[data-cc-padded\][^{]*\{[^}]*\}/g, "");
      css = css.replace(/\[data-cc-pad-skip\][^{]*\{[^}]*\}/g, "");
      customStyle.textContent = css.trim();
      customStyle.removeAttribute("data-cc-custom");
      customStyle.removeAttribute("data-pad-dh");
      customStyle.removeAttribute("data-pad-dv");
      customStyle.removeAttribute("data-pad-mh");
      customStyle.removeAttribute("data-pad-mv");
      // Remove if empty after cleanup
      if (!customStyle.textContent.trim()) customStyle.remove();
    }

    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }

  async function handleSave() {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    setAutoSaveStatus("idle");
    setSaving(true);
    setSaveError("");
    setSaved(false);

    try {
      const html = extractHtmlFromIframe();

      if (isSource) {
        // Save to page.original_html
        const res = await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original_html: html }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.error || `Failed to save (${res.status})`);
          return;
        }
      } else {
        // Save to translation
        const res = await fetch(`/api/translations/${translation.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translated_html: html,
            seo_title: seoTitle || undefined,
            seo_description: seoDesc || undefined,
            slug: slug || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.error || `Failed to save (${res.status})`);
          return;
        }
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
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    setAutoSaveStatus("idle");
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
          slug: slug || undefined,
        }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        setSaveError(data.error || `Failed to save before publish (${saveRes.status})`);
        return;
      }

      setIsDirty(false);
      setShowPublishModal(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save before publish"
      );
    } finally {
      setPublishing(false);
    }
  }

  function handleRevert() {
    if (!isDirty) return;
    setConfirmAction({
      title: "Revert to last save",
      message: "Discard all unsaved changes and reload the last saved version?",
      variant: "warning",
      action: () => {
        setConfirmAction(null);
        window.location.reload();
      },
    });
  }

  function requestRetranslate() {
    if (isDirty) {
      setConfirmAction({
        title: "Discard changes",
        message: "This will discard your unsaved changes and re-translate from the original. Continue?",
        variant: "warning",
        action: doRetranslate,
      });
      return;
    }
    if (translation.status === "published") {
      setConfirmAction({
        title: "Overwrite translation",
        message: "This page is already published. Re-translating will overwrite the current translation. Continue?",
        variant: "warning",
        action: doRetranslate,
      });
      return;
    }
    doRetranslate();
  }

  async function runQualityAnalysis(previousContext?: {
    applied_corrections: { find: string; replace: string }[];
    previous_score: number;
    previous_issues: Record<string, string[]>;
  }) {
    setAnalyzing(true);
    setSaveError("");
    try {
      const res = await fetch("/api/translate/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translation_id: translation.id,
          ...(previousContext && { previous_context: previousContext }),
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setQualityScore(data.quality_score ?? null);
        setQualityAnalysis(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Quality analysis failed");
      }
    } catch {
      setSaveError("Quality analysis failed — check your connection");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleFixQuality() {
    setFixingQuality(true);
    setSaveError("");

    try {
      const res = await fetch("/api/translate/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translation.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Fix failed");
        return;
      }

      const fixData = await res.json().catch(() => ({}));

      setIsDirty(false);
      setIframeKey((k) => k + 1);
      router.refresh();

      // Re-analyze with previous_context so score floor is enforced
      setFixingQuality(false);
      setQualityScore(null);
      setQualityAnalysis(null);
      await runQualityAnalysis({
        applied_corrections: fixData.applied_corrections ?? [],
        previous_score: fixData.previous_score ?? 0,
        previous_issues: fixData.previous_issues ?? {},
      });
      return;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Fix failed");
    } finally {
      setFixingQuality(false);
    }
  }

  async function doRetranslate() {
    setConfirmAction(null);
    setRetranslating(true);
    setSaveError("");
    setQualityScore(null);
    setQualityAnalysis(null);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, language: language.value }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Re-translation failed");
        return;
      }

      setIsDirty(false);
      setIframeKey((k) => k + 1);
      router.refresh();

      // Run quality analysis after translation
      setRetranslating(false);
      await runQualityAnalysis();
      return; // skip the finally setRetranslating since we already set it
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Re-translation failed"
      );
    } finally {
      setRetranslating(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (isDirty) {
                setConfirmAction({
                  title: "Unsaved changes",
                  message: "You have unsaved changes. Leave without saving?",
                  variant: "warning",
                  action: () => { setConfirmAction(null); router.push(`/pages/${pageId}`); },
                });
                return;
              }
              router.push(`/pages/${pageId}`);
            }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <span className="text-gray-300 shrink-0">/</span>
          <span className="text-gray-500 text-sm truncate">{pageName}</span>
          <span className="text-gray-300 shrink-0">/</span>
          <span className="flex items-center gap-1.5 text-gray-900 text-sm font-medium shrink-0">
            {isSource ? (
              <>Edit Source (English)</>
            ) : (
              <><span role="img" aria-label={language.label}>{language.flag}</span> {language.label}</>
            )}
          </span>
          {/* Quality score badge */}
          {analyzing ? (
            <span className="flex items-center gap-1 text-xs text-indigo-600 shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing...
            </span>
          ) : qualityScore != null ? (
            <button
              onClick={() => setShowQualityDetails(!showQualityDetails)}
              className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors ${
                qualityScore >= 85
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : qualityScore >= 60
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
              title="Click to toggle quality details"
            >
              {qualityScore}
            </button>
          ) : (
            <button
              onClick={() => runQualityAnalysis()}
              className="text-xs text-gray-400 hover:text-indigo-600 shrink-0 transition-colors"
              title="Run quality analysis"
            >
              Analyze
            </button>
          )}
          {variantLabel && (
            <>
              <span className="text-gray-300 shrink-0">/</span>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded shrink-0">
                {variantLabel}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {bgImageTranslating && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <Loader2 className="w-3 h-3 animate-spin" /> Translating image...
            </span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Autosaving...
            </span>
          )}
          {autoSaveStatus === "saved" && !isDirty && !saved && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Autosaved
            </span>
          )}
          {isDirty && autoSaveStatus !== "saving" && (
            <button
              onClick={handleRevert}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors"
              title="Revert to last save"
            >
              <Undo2 className="w-3 h-3" />
              Unsaved changes
            </button>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {!isSource && (
            <button
              onClick={requestRetranslate}
              disabled={saving || publishing || retranslating}
              className="flex items-center gap-1.5 disabled:opacity-50 text-gray-400 hover:text-red-600 text-xs px-2 py-2 rounded-lg transition-colors"
              title="Overwrites any manual edits"
            >
              {retranslating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              {retranslating ? "Translating…" : "Re-translate"}
            </button>
          )}
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={handleSave}
            disabled={saving || publishing || retranslating}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-900 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
          {!isSource && (
            <button
              onClick={handlePublish}
              disabled={saving || publishing || retranslating}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {publishing ? "Publishing..." : "Save & Publish"}
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border-b border-red-200 px-6 py-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Quality analysis details panel */}
      {showQualityDetails && qualityAnalysis && (
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-600 max-w-3xl">{qualityAnalysis.overall_assessment}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleFixQuality}
                disabled={fixingQuality || retranslating || saving}
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
              >
                {fixingQuality ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {fixingQuality ? "Fixing…" : "Fix quality"}
              </button>
              <button
                onClick={() => setShowQualityDetails(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-xs">Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Preview / editing pane */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0 bg-white">
            <span className={`text-xs font-medium uppercase tracking-wider ${excludeMode ? "text-amber-600" : "text-gray-500"}`}>
              {excludeMode ? "Click elements to exclude from padding" : "Click any text to edit"}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5">
                <button
                  onClick={() => setViewMode("desktop")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                    viewMode === "desktop"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setViewMode("mobile")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                    viewMode === "mobile"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => {
                  if (isDirty) {
                    setConfirmAction({
                      title: "Unsaved changes",
                      message: "You have unsaved changes. Reload preview?",
                      variant: "warning",
                      action: () => { setConfirmAction(null); setIframeKey((k) => k + 1); setIsDirty(false); },
                    });
                    return;
                  }
                  setIframeKey((k) => k + 1);
                }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>
          <div className={`flex-1 overflow-auto ${viewMode === "mobile" ? "flex justify-center bg-gray-100" : ""}`}>
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={`/api/preview/${translation.id}`}
              onLoad={handleIframeLoad}
              className={`bg-white h-full ${
                viewMode === "mobile"
                  ? "w-[375px] border-x border-gray-200 shadow-2xl"
                  : "w-full"
              }`}
              sandbox="allow-scripts allow-same-origin"
              title="Translation editor"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-gray-200 shrink-0 flex flex-col overflow-y-auto bg-white">
          {clickedImage ? (
            /* Image clicked: ImagePanel takes over the full sidebar */
            <ImagePanel
              iframeRef={iframeRef}
              translationId={translation.id}
              language={language}
              clickedImage={clickedImage}
              originalHtml={originalHtml}
              onClickedImageClear={() => setClickedImage(null)}
              onImageReplaced={() => markDirty()}
              onImageTranslating={setBgImageTranslating}
              isSource={isSource}
              pageProduct={pageProduct}
            />
          ) : (
            /* Normal view: page settings */
            <>
              <PaddingControls
                viewMode={viewMode}
                padDH={padDH}
                padDV={padDV}
                padMH={padMH}
                padMV={padMV}
                excludeMode={excludeMode}
                excludeCount={excludeCount}
                onViewModeChange={setViewMode}
                onPaddingChange={handlePaddingChange}
                onToggleExclude={() => setExcludeMode(!excludeMode)}
              />
              <div className="border-t border-gray-200" />

              <ElementControls
                selectedElRef={selectedElRef}
                iframeRef={iframeRef}
                hasSelectedEl={hasSelectedEl}
                onDeselect={() => {
                  if (selectedElRef.current) {
                    selectedElRef.current.removeAttribute("data-cc-selected");
                    selectedElRef.current = null;
                  }
                  setHasSelectedEl(false);
                }}
                onHide={handleHideElement}
                onDelete={handleDeleteElement}
                markDirty={markDirty}
                isSource={isSource}
                languageValue={language.value}
                pageProduct={pageProduct}
              />

              {/* Hidden elements indicator */}
              {hiddenCount > 0 && !hasSelectedEl && (
                <>
                  <div className="px-4 py-2">
                    <button
                      onClick={toggleRevealHidden}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
                        revealHidden
                          ? "bg-red-50 border-red-300 text-red-700"
                          : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      {revealHidden ? "Click to unhide" : `${hiddenCount} hidden`}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                </>
              )}

              {/* Layers panel */}
              <LayersPanel
                iframeRef={iframeRef}
                selectedElRef={selectedElRef}
                hasSelectedEl={hasSelectedEl}
                refreshKey={layersRefreshKey}
                onSelectElement={() => setHasSelectedEl(true)}
                onToggleVisibility={handleToggleLayerVisibility}
                markDirty={markDirty}
              />

              <div className="border-t border-gray-200" />

              {/* Page settings button */}
              <div className="px-4 py-3">
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="w-full flex items-center justify-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Page Settings
                </button>
              </div>

              <div className="border-t border-gray-200" />

              {/* Images hint */}
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Images
                </p>
                <p className="text-xs text-gray-400">
                  Click an image in the preview to translate or replace it.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <PageSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        linkUrl={linkUrl}
        onLinkUrlChange={handleLinkUrlChange}
        slug={slug}
        onSlugChange={setSlug}
        seoTitle={seoTitle}
        onSeoTitleChange={setSeoTitle}
        seoDesc={seoDesc}
        onSeoDescChange={setSeoDesc}
        language={language}
        filteredUrls={filteredUrls}
        urlMode={urlMode}
        onUrlModeChange={setUrlMode}
        markDirty={markDirty}
      />

      {/* Publish progress modal */}
      <PublishModal
        open={showPublishModal}
        translationId={translation.id}
        onClose={(published) => {
          setShowPublishModal(false);
          if (published) {
            router.push(`/pages/${pageId}`);
            router.refresh();
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel="Continue"
        variant={confirmAction?.variant ?? "default"}
        onConfirm={() => confirmAction?.action()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
