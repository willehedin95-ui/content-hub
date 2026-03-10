"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

import {
  Translation,
  LANGUAGES,
  COUNTRY_MAP,
  MarketProductUrl,
  PageQualityAnalysis,
} from "@/types";
import { BLOCKS_MAP } from "./block-definitions";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type ViewMode = "desktop" | "mobile";
export type LeftTab = "layers" | "components" | "settings";
export type RightTab = "design" | "config" | "ai";
export type AutoSaveStatus = "idle" | "saving" | "saved";
export type BlockType = "text" | "image" | "cta" | "divider" | "video";

export type ViewportConfig = {
  device: "desktop" | "iphone-13" | "ipad" | "custom";
  width: number | null;
  height: number | null;
};

export const DEFAULT_VIEWPORT_WIDTH = 375;
export const DEFAULT_VIEWPORT_HEIGHT = 812;

export interface ClickedMedia {
  src: string;
  index: number;
  width: number;
  height: number;
}

export interface BuilderProps {
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

export interface ConfirmAction {
  title: string;
  message: string;
  variant: "danger" | "warning" | "default";
  action: () => void;
}

export interface SavedComponent {
  id: string;
  name: string;
  html: string;
  thumbnail_url: string | null;
  product: string | null;
  category: string;
  created_at: string;
}

export interface BuilderContextValue {
  // --- Props (passed through) ---
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct: string | undefined;
  originalHtml: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel: string | undefined;
  isSource: boolean | undefined;

  // --- Router ---
  router: ReturnType<typeof useRouter>;

  // --- Refs ---
  iframeRef: RefObject<HTMLIFrameElement | null>;
  selectedElRef: RefObject<HTMLElement | null>;

  // --- Core state ---
  seoTitle: string;
  setSeoTitle: (v: string) => void;
  seoDesc: string;
  setSeoDesc: (v: string) => void;
  saving: boolean;
  publishing: boolean;
  retranslating: boolean;
  saveError: string;
  setSaveError: (v: string) => void;
  saved: boolean;
  isDirty: boolean;
  setIsDirty: (v: boolean) => void;
  iframeKey: number;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;

  // --- Padding ---
  padDH: string;
  padDV: string;
  padMH: string;
  padMV: string;
  excludeMode: boolean;
  setExcludeMode: (v: boolean) => void;
  excludeCount: number;

  // --- Modals ---
  showPublishModal: boolean;
  setShowPublishModal: (v: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (v: boolean) => void;

  // --- Quality ---
  fixingQuality: boolean;
  qualityScore: number | null;
  qualityAnalysis: PageQualityAnalysis | null;
  analyzing: boolean;
  showQualityDetails: boolean;
  setShowQualityDetails: (v: boolean) => void;

  // --- Link / Slug ---
  linkUrl: string;
  slug: string;
  setSlug: (v: string) => void;

  // --- Media clicks ---
  clickedImage: ClickedMedia | null;
  setClickedImage: (v: ClickedMedia | null) => void;
  clickedVideo: ClickedMedia | null;
  setClickedVideo: (v: ClickedMedia | null) => void;
  bgImageTranslating: boolean;
  setBgImageTranslating: (v: boolean) => void;

  // --- Element selection ---
  hasSelectedEl: boolean;
  setHasSelectedEl: (v: boolean) => void;
  selectedElsRef: RefObject<Set<HTMLElement>>;
  multiSelectCount: number;
  hiddenCount: number;
  revealHidden: boolean;
  layersRefreshKey: number;

  // --- Undo / redo ---
  undoCount: number;
  redoCount: number;

  // --- Autosave ---
  autoSaveStatus: AutoSaveStatus;

  // --- Market URLs ---
  marketUrls: MarketProductUrl[];
  urlMode: "saved" | "custom";
  setUrlMode: (v: "saved" | "custom") => void;
  filteredUrls: MarketProductUrl[];

  // --- Confirm dialog ---
  confirmAction: ConfirmAction | null;
  setConfirmAction: (v: ConfirmAction | null) => void;

  // --- New builder layout state ---
  zoom: number;
  setZoom: (v: number) => void;
  leftTab: LeftTab;
  setLeftTab: (v: LeftTab) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (v: boolean) => void;
  rightTab: RightTab;
  setRightTab: (v: RightTab) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (v: boolean) => void;

  // --- Viewport configuration ---
  viewportConfig: ViewportConfig;
  setViewportConfig: React.Dispatch<React.SetStateAction<ViewportConfig>>;

  // --- Link modal state ---
  showLinkModal: boolean;
  setShowLinkModal: React.Dispatch<React.SetStateAction<boolean>>;

  // --- Callbacks ---
  triggerAutosave: () => void;
  pushUndoSnapshot: () => void;
  markDirty: () => void;
  handleHideElement: () => void;
  handleToggleLayerVisibility: (el: HTMLElement) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleDuplicateElement: () => void;
  handleDeleteElement: () => void;
  toggleRevealHidden: () => void;
  handleIframeLoad: () => void;
  syncPaddingToIframe: (dh: string, dv: string, mh: string, mv: string) => void;
  handlePaddingChange: (axis: "h" | "v", value: string) => void;
  handleLinkUrlChange: (newUrl: string) => void;
  extractHtmlFromIframe: () => string;
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleRevert: () => void;
  requestRetranslate: () => void;
  runQualityAnalysis: (previousContext?: {
    applied_corrections: { find: string; replace: string }[];
    previous_score: number;
    previous_issues: Record<string, string[]>;
  }) => Promise<void>;
  handleFixQuality: () => Promise<void>;
  doRetranslate: () => Promise<void>;

  // --- Copy/paste styles ---
  handleCopyStyles: () => void;
  handlePasteStyles: () => void;
  hasCopiedStyles: boolean;

  // --- Context menu ---
  contextMenu: { x: number; y: number; targetEl: HTMLElement } | null;
  openContextMenu: (el: HTMLElement, x: number, y: number) => void;
  closeContextMenu: () => void;

  // --- Clipboard (copy/paste elements) ---
  copiedHtmlRef: RefObject<string | null>;
  handleCopyElement: () => void;
  handlePasteElement: () => void;

  // --- Group ---
  handleGroupElement: () => void;

  // --- Rename ---
  renamingEl: HTMLElement | null;
  setRenamingEl: (el: HTMLElement | null) => void;
  startRenameElement: () => void;
  handleRenameElement: (newName: string) => void;

  // --- Save as component ---
  showSaveComponentModal: boolean;
  setShowSaveComponentModal: (v: boolean) => void;
  saveComponentHtml: string;
  handleSaveAsComponent: () => void;
  savedComponents: SavedComponent[];
  setSavedComponents: React.Dispatch<React.SetStateAction<SavedComponent[]>>;
  insertSavedComponent: (html: string) => void;

  // --- Drag from components tab ---
  dragComponentRef: React.RefObject<{ type: "block"; blockId: string } | { type: "saved"; html: string } | null>;
  isDraggingFromComponents: boolean;
  setIsDraggingFromComponents: (v: boolean) => void;
  insertAtPosition: (
    target: HTMLElement,
    position: "before" | "after",
    payload: { type: "block"; blockId: string } | { type: "saved"; html: string }
  ) => void;

  // --- Convenience methods ---
  selectElementInIframe: (el: HTMLElement) => void;
  deselectElement: () => void;
  reloadIframe: () => void;
}

// ---------------------------------------------------------------------------
// Module-level utility (not part of context — pure function)
// ---------------------------------------------------------------------------

export function buildPaddingCss(
  dh: string,
  dv: string,
  mh: string,
  mv: string
): string {
  const rules: string[] = [];

  const dhVal = dh !== "" ? parseInt(dh) : null;
  const dvVal = dv !== "" ? parseInt(dv) : null;
  if (dhVal !== null || dvVal !== null) {
    const inner: string[] = [];
    if (dhVal !== null)
      inner.push(
        `[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${dhVal}px !important; padding-right: ${dhVal}px !important; }`
      );
    if (dvVal !== null)
      inner.push(
        `body { padding-top: ${dvVal}px !important; padding-bottom: ${dvVal}px !important; }`
      );
    rules.push(`@media (min-width: 769px) {\n  ${inner.join("\n  ")}\n}`);
  }

  const mhVal = mh !== "" ? parseInt(mh) : null;
  const mvVal = mv !== "" ? parseInt(mv) : null;
  if (mhVal !== null || mvVal !== null) {
    const inner: string[] = [];
    if (mhVal !== null)
      inner.push(
        `[data-cc-padded]:not([data-cc-pad-skip]) { padding-left: ${mhVal}px !important; padding-right: ${mhVal}px !important; }`
      );
    if (mvVal !== null)
      inner.push(
        `body { padding-top: ${mvVal}px !important; padding-bottom: ${mvVal}px !important; }`
      );
    rules.push(`@media (max-width: 768px) {\n  ${inner.join("\n  ")}\n}`);
  }

  return rules.join("\n");
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx)
    throw new Error("useBuilder must be used within a <BuilderProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BuilderProvider({
  children,
  ...props
}: BuilderProps & { children: ReactNode }) {
  const {
    pageId,
    pageName,
    pageSlug,
    pageProduct,
    originalHtml,
    translation,
    language,
    variantLabel,
    isSource,
  } = props;

  const router = useRouter();

  // -----------------------------------------------------------------------
  // Refs
  // -----------------------------------------------------------------------
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const selectedElRef = useRef<HTMLElement | null>(null);
  const selectedElsRef = useRef<Set<HTMLElement>>(new Set());
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const skipSnapshotRef = useRef(false);
  const baselineHtmlRef = useRef<string>("");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveDataRef = useRef({ seoTitle: "", seoDesc: "", slug: "" });
  const savingRef = useRef(false);
  const prevLinkUrl = useRef("");
  const excludeModeRef = useRef(false);
  // enteredContainerRef reserved for future Figma-style container selection
  const copiedStylesRef = useRef<Record<string, string> | null>(null);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // -----------------------------------------------------------------------
  // State — ported from EditPageClient.tsx
  // -----------------------------------------------------------------------
  const [seoTitle, setSeoTitle] = useState(translation.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(translation.seo_description ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
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
  const [slug, setSlug] = useState(translation.slug ?? pageSlug);
  const [clickedImage, setClickedImage] = useState<ClickedMedia | null>(null);
  const [clickedVideo, setClickedVideo] = useState<ClickedMedia | null>(null);
  const [bgImageTranslating, setBgImageTranslating] = useState(false);

  // Element-level editing
  const [hasSelectedEl, setHasSelectedEl] = useState(false);
  const [multiSelectCount, setMultiSelectCount] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [revealHidden, setRevealHidden] = useState(false);
  const [layersRefreshKey, setLayersRefreshKey] = useState(0);

  // Undo/redo
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Quality analysis
  const [qualityScore, setQualityScore] = useState<number | null>(
    translation.quality_score ?? null
  );
  const [qualityAnalysis, setQualityAnalysis] =
    useState<PageQualityAnalysis | null>(translation.quality_analysis ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showQualityDetails, setShowQualityDetails] = useState(false);

  // Market product URLs
  const [marketUrls, setMarketUrls] = useState<MarketProductUrl[]>([]);
  const [urlMode, setUrlMode] = useState<"saved" | "custom">("custom");

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null
  );

  // Autosave
  const [autoSaveStatus, setAutoSaveStatus] =
    useState<AutoSaveStatus>("idle");

  // Copy/paste styles
  const [hasCopiedStyles, setHasCopiedStyles] = useState(false);

  // --- New builder layout state ---
  const [zoom, setZoom] = useState(100);
  const [leftTab, setLeftTab] = useState<LeftTab>("layers");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Viewport configuration
  const [viewportConfig, setViewportConfig] = useState<ViewportConfig>({
    device: "desktop",
    width: null,
    height: null,
  });

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetEl: HTMLElement } | null>(null);

  // Clipboard (element HTML string)
  const copiedHtmlRef = useRef<string | null>(null);

  // Rename state (which element is being renamed in layers)
  const [renamingEl, setRenamingEl] = useState<HTMLElement | null>(null);

  // Save component modal
  const [showSaveComponentModal, setShowSaveComponentModal] = useState(false);
  const [saveComponentHtml, setSaveComponentHtml] = useState("");

  // Saved components list (fetched from API on mount)
  const [savedComponents, setSavedComponents] = useState<SavedComponent[]>([]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------
  const country = COUNTRY_MAP[language.value];
  const filteredUrls = marketUrls.filter((u) => u.country === country);

  // -----------------------------------------------------------------------
  // Ref-sync effects
  // -----------------------------------------------------------------------
  useEffect(() => {
    autosaveDataRef.current = { seoTitle, seoDesc, slug };
  }, [seoTitle, seoDesc, slug]);

  useEffect(() => {
    savingRef.current = saving || publishing || retranslating;
  }, [saving, publishing, retranslating]);

  useEffect(() => {
    excludeModeRef.current = excludeMode;
  }, [excludeMode]);

  // -----------------------------------------------------------------------
  // extractHtmlFromIframe — declared early because callbacks below need it
  // -----------------------------------------------------------------------
  function extractHtmlFromIframe(): string {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) {
      throw new Error("Cannot access iframe document");
    }
    const doc = iframe.contentDocument;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;

    // Remove all editor-injected elements
    clone.querySelectorAll("[data-cc-editor]").forEach((el) => el.remove());
    clone.querySelectorAll("[data-cc-injected]").forEach((el) => el.remove());
    clone
      .querySelectorAll("[data-cc-el-toolbar]")
      .forEach((el) => el.remove());
    clone
      .querySelectorAll("[data-cc-exclude-mode]")
      .forEach((el) => el.remove());

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
    clone.querySelectorAll("[data-cc-media-highlight]").forEach((el) => {
      (el as HTMLElement).style.outline = "";
      el.removeAttribute("data-cc-media-highlight");
    });
    clone.querySelectorAll("[data-cc-video-placeholder]").forEach((el) => {
      el.removeAttribute("data-cc-video-placeholder");
    });
    clone.querySelectorAll("[data-cc-selected]").forEach((el) => {
      el.removeAttribute("data-cc-selected");
    });
    clone.querySelectorAll("[data-cc-hover]").forEach((el) => {
      el.removeAttribute("data-cc-hover");
    });
    clone.querySelectorAll("[data-cc-hover-label]").forEach((el) => {
      el.remove();
    });
    // Clean padding/hide editor attributes
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

    // Rewrite the data-cc-custom style tag to clean selectors
    const customStyle = clone.querySelector("style[data-cc-custom]");
    if (customStyle) {
      let css = customStyle.textContent || "";
      css = css.replace(
        /\[data-cc-padded\]:not\(\[data-cc-pad-skip\]\)/g,
        "[data-pad]"
      );
      css = css.replace(/\[data-cc-padded\][^{]*\{[^}]*\}/g, "");
      css = css.replace(/\[data-cc-pad-skip\][^{]*\{[^}]*\}/g, "");
      customStyle.textContent = css.trim();
      customStyle.removeAttribute("data-cc-custom");
      customStyle.removeAttribute("data-pad-dh");
      customStyle.removeAttribute("data-pad-dv");
      customStyle.removeAttribute("data-pad-mh");
      customStyle.removeAttribute("data-pad-mv");
      if (!customStyle.textContent.trim()) customStyle.remove();
    }

    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  const triggerAutosave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      // Lock autosave to prevent concurrent saves
      if (savingRef.current) return;
      savingRef.current = true;
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
          if (autoSavedTimeoutRef.current)
            clearTimeout(autoSavedTimeoutRef.current);
          autoSavedTimeoutRef.current = setTimeout(
            () => setAutoSaveStatus("idle"),
            3000
          );
        } else {
          setAutoSaveStatus("idle");
        }
      } catch {
        setAutoSaveStatus("idle");
      } finally {
        savingRef.current = false;
      }
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation.id, isSource, pageId]);

  const pushUndoSnapshot = useCallback(() => {
    if (skipSnapshotRef.current) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const currentHtml = doc.body.innerHTML;
    const baseline = baselineHtmlRef.current;
    if (baseline === currentHtml) return;
    if (baseline) {
      const stack = undoStackRef.current;
      if (stack.length === 0 || stack[stack.length - 1] !== baseline) {
        stack.push(baseline);
        if (stack.length > 50) stack.shift();
      }
    }
    baselineHtmlRef.current = currentHtml;
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setLayersRefreshKey((k) => k + 1);
    pushUndoSnapshot();
    triggerAutosave();
  }, [triggerAutosave, pushUndoSnapshot]);

  // -----------------------------------------------------------------------
  // Handler functions
  // -----------------------------------------------------------------------

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

  function handleUndo() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || undoStackRef.current.length === 0) return;
    redoStackRef.current.push(baselineHtmlRef.current);
    const prev = undoStackRef.current.pop()!;
    skipSnapshotRef.current = true;
    // Trusted iframe-local snapshots — safe to restore via innerHTML
    // eslint-disable-next-line no-unsanitized/property
    doc.body.innerHTML = prev;
    skipSnapshotRef.current = false;
    baselineHtmlRef.current = prev;
    selectedElRef.current = null;
    selectedElsRef.current.clear();
    setMultiSelectCount(0);
    setHasSelectedEl(false);
    setHiddenCount(doc.querySelectorAll("[data-cc-hidden]").length);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
    setLayersRefreshKey((k) => k + 1);
    setIsDirty(true);
    triggerAutosave();
  }

  function handleRedo() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || redoStackRef.current.length === 0) return;
    undoStackRef.current.push(baselineHtmlRef.current);
    const next = redoStackRef.current.pop()!;
    skipSnapshotRef.current = true;
    // Trusted iframe-local snapshots — safe to restore via innerHTML
    // eslint-disable-next-line no-unsanitized/property
    doc.body.innerHTML = next;
    skipSnapshotRef.current = false;
    baselineHtmlRef.current = next;
    selectedElRef.current = null;
    selectedElsRef.current.clear();
    setMultiSelectCount(0);
    setHasSelectedEl(false);
    setHiddenCount(doc.querySelectorAll("[data-cc-hidden]").length);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
    setLayersRefreshKey((k) => k + 1);
    setIsDirty(true);
    triggerAutosave();
  }

  function handleDuplicateElement() {
    if (selectedElsRef.current.size > 1) {
      pushUndoSnapshot();
      const newEls: HTMLElement[] = [];
      selectedElsRef.current.forEach(el => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-cc-selected");
        el.parentNode?.insertBefore(clone, el.nextSibling);
        newEls.push(clone);
      });
      markDirty();
      return;
    }
    const el = selectedElRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-cc-selected");
    el.parentNode?.insertBefore(clone, el.nextSibling);
    markDirty();
  }

  function handleDeleteElement() {
    if (selectedElsRef.current.size > 1) {
      pushUndoSnapshot();
      selectedElsRef.current.forEach(el => el.remove());
      selectedElsRef.current.clear();
      selectedElRef.current = null;
      setMultiSelectCount(0);
      setHasSelectedEl(false);
      markDirty();
      return;
    }
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.remove();
    selectedElRef.current = null;
    selectedElsRef.current.clear();
    setMultiSelectCount(0);
    setHasSelectedEl(false);
    markDirty();
  }

  function toggleRevealHidden() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const newState = !revealHidden;
    setRevealHidden(newState);
    doc.querySelectorAll("[data-cc-hidden]").forEach((el) => {
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

  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const body = doc.body;
    if (!body) return;
    const win = doc.defaultView;
    if (!win) return;

    // Clean orphaned editor styles from previously-saved HTML
    doc
      .querySelectorAll("style[data-cc-exclude-mode]")
      .forEach((el) => el.remove());
    doc.querySelectorAll("style").forEach((el) => {
      const css = el.textContent || "";
      if (css.includes("data-cc-pad-skip") && css.includes("dashed"))
        el.remove();
    });

    // Strip third-party scripts/widgets from editor (Freshchat, analytics, etc.)
    // They run live in the iframe and can't be selected/deleted. Keep only
    // editor-injected scripts (data-cc-*). Originals are preserved in saved HTML.
    doc.querySelectorAll("script").forEach((s) => {
      if (!s.hasAttribute("data-cc-injected")) s.remove();
    });
    // Also remove iframes injected by widgets (chat widgets, trackers)
    doc.querySelectorAll("iframe:not([data-cc-injected])").forEach((f) => {
      const src = f.getAttribute("src") || "";
      if (!src.startsWith("/api/preview")) f.remove();
    });

    // Convert clean data-pad attributes back to editor data-cc-padded
    doc.querySelectorAll("[data-pad]").forEach((el) => {
      el.setAttribute("data-cc-padded", "");
      el.removeAttribute("data-pad");
    });

    const SKIP_TAGS = [
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "SVG",
      "PATH",
      "BR",
      "HR",
      "IMG",
    ];
    const allElements = body.querySelectorAll("*");
    const limit = Math.min(allElements.length, 200); // Reduced from 500 to 200
    let maxH = 0;

    // Use requestIdleCallback if available for non-blocking detection
    const detectPadding = (startIdx: number, endIdx: number) => {
      for (let i = startIdx; i < endIdx; i++) {
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
        if (
          !display.includes("block") &&
          !display.includes("flex") &&
          !display.includes("grid")
        )
          continue;

        const pl = parseInt(cs.paddingLeft) || 0;
        const pr = parseInt(cs.paddingRight) || 0;
        const pad = Math.max(pl, pr);
        if (pad >= 16) {
          el.setAttribute("data-cc-padded", "");
          maxH = Math.max(maxH, pad);
        }
      }
    };

    // Process in smaller batches to avoid blocking
    detectPadding(0, limit);

    // Detect link URL, element selection, hidden count
    setExcludeCount(doc.querySelectorAll("[data-cc-pad-skip]").length);

    // Optimize link detection by sampling first 100 links
    const links = doc.querySelectorAll("a[href]");
    const linkSample = Array.from(links).slice(0, 100);
    const urlCounts = new Map<string, number>();
    linkSample.forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (
        !href ||
        href.startsWith("javascript:") ||
        href === "#" ||
        href.startsWith("mailto:")
      )
        return;
      urlCounts.set(href, (urlCounts.get(href) || 0) + 1);
    });
    let topUrl = "";
    let topCount = 0;
    urlCounts.forEach((count, url) => {
      if (count > topCount) {
        topUrl = url;
        topCount = count;
      }
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

    // Trigger layers panel rebuild
    setLayersRefreshKey((k) => k + 1);

    // Initialize undo stack with clean state
    undoStackRef.current = [];
    redoStackRef.current = [];
    baselineHtmlRef.current = doc.body.innerHTML;
    setUndoCount(0);
    setRedoCount(0);

    // Inject element selection + hover styles
    const elStyle = doc.createElement("style");
    elStyle.setAttribute("data-cc-el-toolbar", "true");
    elStyle.textContent = `
      [data-cc-selected] { outline: 2px solid rgba(99,102,241,0.8) !important; outline-offset: 2px; }
[data-cc-hover]:not([data-cc-selected]) { outline: 1px solid rgba(99,102,241,0.4) !important; outline-offset: 1px; }
      [data-cc-hover-label] {
        position: fixed; pointer-events: none; z-index: 99999;
        background: rgba(99,102,241,0.85); color: #fff;
        font: 500 10px/1 system-ui, sans-serif; letter-spacing: 0.3px;
        padding: 2px 6px; border-radius: 2px; white-space: nowrap;
      }
    `;

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
      existing.textContent = (existing.textContent || "").replace(
        /\[data-pad\]/g,
        "[data-cc-padded]:not([data-cc-pad-skip])"
      );
      return;
    }

    // Detect clean [data-pad] style from a previous save
    const cleanPadStyle = Array.from(doc.querySelectorAll("style")).find(
      (s) =>
        (s.textContent || "").includes("[data-pad]") &&
        !s.hasAttribute("data-cc-custom")
    );
    if (cleanPadStyle) {
      const css = cleanPadStyle.textContent || "";
      const dhMatch = css.match(
        /min-width:\s*769px\)[^}]*\[data-pad\][^{]*\{\s*padding-left:\s*(\d+)px/
      );
      const mhMatch = css.match(
        /max-width:\s*768px\)[^}]*\[data-pad\][^{]*\{\s*padding-left:\s*(\d+)px/
      );
      const dvMatch = css.match(
        /min-width:\s*769px\)[^}]*body[^{]*\{\s*padding-top:\s*(\d+)px/
      );
      const mvMatch = css.match(
        /max-width:\s*768px\)[^}]*body[^{]*\{\s*padding-top:\s*(\d+)px/
      );
      if (dhMatch) setPadDH(dhMatch[1]);
      if (mhMatch) setPadMH(mhMatch[1]);
      if (dvMatch) setPadDV(dvMatch[1]);
      if (mvMatch) setPadMV(mvMatch[1]);
      cleanPadStyle.setAttribute("data-cc-custom", "true");
      if (dhMatch) cleanPadStyle.setAttribute("data-pad-dh", dhMatch[1]);
      if (dvMatch) cleanPadStyle.setAttribute("data-pad-dv", dvMatch[1]);
      if (mhMatch) cleanPadStyle.setAttribute("data-pad-mh", mhMatch[1]);
      if (mvMatch) cleanPadStyle.setAttribute("data-pad-mv", mvMatch[1]);
      cleanPadStyle.textContent = css.replace(
        /\[data-pad\]/g,
        "[data-cc-padded]:not([data-cc-pad-skip])"
      );
      return;
    }

    if (maxH > 0) {
      setPadDH(String(maxH));
      setPadMH(String(maxH));
    }
    doc.head.appendChild(elStyle);

    // Helper to select an element (clears previous, sets state)
    function selectElement(el: HTMLElement) {
      selectedElsRef.current.forEach(e => e.removeAttribute("data-cc-selected"));
      selectedElsRef.current.clear();
      if (selectedElRef.current) {
        selectedElRef.current.removeAttribute("data-cc-selected");
      }
      el.setAttribute("data-cc-selected", "");
      selectedElRef.current = el;
      selectedElsRef.current.add(el);
      setMultiSelectCount(1);
      setHasSelectedEl(true);
      setLayersRefreshKey((k) => k + 1);
    }

    // Click handler — direct selection (click selects whatever you click on)
    doc.addEventListener(
      "click",
      function (e: Event) {
        const me = e as MouseEvent;
        const target = me.target as HTMLElement;
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

        // Clicking body/html — deselect ALL
        if (target === body || target.tagName === "HTML") {
          if (selectedElRef.current) {
            selectedElRef.current.removeAttribute("data-cc-selected");
            selectedElRef.current = null;
          }
          selectedElsRef.current.forEach(el => el.removeAttribute("data-cc-selected"));
          selectedElsRef.current.clear();
          setMultiSelectCount(0);
          setHasSelectedEl(false);
          setLayersRefreshKey((k) => k + 1);
          return;
        }

        // Skip in exclude mode
        if (excludeModeRef.current) return;

        const isMulti = me.shiftKey;

        if (isMulti) {
          // MULTI-SELECT — toggle in/out of selection
          if (selectedElsRef.current.has(target)) {
            target.removeAttribute("data-cc-selected");
            selectedElsRef.current.delete(target);
            if (selectedElRef.current === target) {
              const remaining = Array.from(selectedElsRef.current);
              if (remaining.length > 0) {
                selectedElRef.current = remaining[0];
              } else {
                selectedElRef.current = null;
                setHasSelectedEl(false);
              }
            }
          } else {
            target.setAttribute("data-cc-selected", "");
            selectedElsRef.current.add(target);
            if (!selectedElRef.current) {
              selectedElRef.current = target;
              setHasSelectedEl(true);
            }
            if (selectedElRef.current && !selectedElsRef.current.has(selectedElRef.current)) {
              selectedElsRef.current.add(selectedElRef.current);
              selectedElRef.current.setAttribute("data-cc-selected", "");
            }
          }
          setMultiSelectCount(selectedElsRef.current.size);
          setLayersRefreshKey((k) => k + 1);
        } else {
          selectElement(target);
        }
      },
      false
    );

    // Hover highlighting — outline + floating tag label
    const HOVER_SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "BR", "HR", "HTML"]);
    const TAG_LABELS: Record<string, string> = {
      H1: "H1", H2: "H2", H3: "H3", H4: "H4", H5: "H5", H6: "H6",
      P: "Paragraph", SPAN: "Span", A: "Link", BUTTON: "Button",
      IMG: "Image", VIDEO: "Video", DIV: "Div", SECTION: "Section",
      HEADER: "Header", FOOTER: "Footer", NAV: "Nav", MAIN: "Main",
      UL: "List", OL: "List", LI: "List Item", FORM: "Form",
      INPUT: "Input", TEXTAREA: "Textarea", LABEL: "Label",
      BLOCKQUOTE: "Quote", FIGURE: "Figure", FIGCAPTION: "Caption",
      TABLE: "Table", ARTICLE: "Article", ASIDE: "Aside",
    };
    let hoverLabel: HTMLElement | null = null;
    let hoveredEl: HTMLElement | null = null;

    doc.addEventListener("mouseover", function (e: Event) {
      const me = e as MouseEvent;
      const target = me.target as HTMLElement;
      if (HOVER_SKIP.has(target.tagName)) return;
      if (target === body) return;
      if (target.hasAttribute("data-cc-hidden")) return;

      const hoverTarget = target;

      // Remove previous hover
      if (hoveredEl && hoveredEl !== hoverTarget) {
        hoveredEl.removeAttribute("data-cc-hover");
      }
      hoveredEl = hoverTarget;
      hoverTarget.setAttribute("data-cc-hover", "");

      // Create or update floating label
      if (!hoverLabel) {
        hoverLabel = doc.createElement("div");
        hoverLabel.setAttribute("data-cc-hover-label", "");
        doc.body.appendChild(hoverLabel);
      }
      const customName = hoverTarget.getAttribute("data-cc-name");
      const labelText = customName || TAG_LABELS[hoverTarget.tagName] || hoverTarget.tagName.toLowerCase();
      hoverLabel.textContent = labelText;
      const rect = hoverTarget.getBoundingClientRect();
      hoverLabel.style.left = rect.left + "px";
      hoverLabel.style.top = Math.max(0, rect.top - 18) + "px";
      hoverLabel.style.display = "block";
    }, true);

    doc.addEventListener("mouseout", function (e: Event) {
      const target = e.target as HTMLElement;
      target.removeAttribute("data-cc-hover");
      if (hoveredEl === target) hoveredEl = null;
      if (hoverLabel) hoverLabel.style.display = "none";
    }, true);

    // Context menu handler for right-click in iframe
    doc.addEventListener("contextmenu", function (e: MouseEvent) {
      e.preventDefault();
      const target = e.target as HTMLElement;
      if (!target || target === doc.body || target === doc.documentElement) return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      openContextMenuRef.current(target, rect.left + e.clientX, rect.top + e.clientY);
    });
  }

  function syncPaddingToIframe(
    dh: string,
    dv: string,
    mh: string,
    mv: string
  ) {
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
    let dh = padDH,
      dv = padDV,
      mh = padMH,
      mv = padMV;
    if (viewMode === "desktop") {
      if (axis === "h") {
        dh = value;
        setPadDH(value);
      } else {
        dv = value;
        setPadDV(value);
      }
    } else {
      if (axis === "h") {
        mh = value;
        setPadMH(value);
      } else {
        mv = value;
        setPadMV(value);
      }
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

  async function handleSave() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setAutoSaveStatus("idle");
    setSaving(true);
    setSaveError("");
    setSaved(false);

    try {
      const html = extractHtmlFromIframe();

      if (isSource) {
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
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
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
        setSaveError(
          data.error || `Failed to save before publish (${saveRes.status})`
        );
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
      message:
        "Discard all unsaved changes and reload the last saved version?",
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
        message:
          "This will discard your unsaved changes and re-translate from the original. Continue?",
        variant: "warning",
        action: doRetranslate,
      });
      return;
    }
    if (translation.status === "published") {
      setConfirmAction({
        title: "Overwrite translation",
        message:
          "This page is already published. Re-translating will overwrite the current translation. Continue?",
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
      setSaveError("Quality analysis failed -- check your connection");
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

      setRetranslating(false);
      await runQualityAnalysis();
      return;
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Re-translation failed"
      );
    } finally {
      setRetranslating(false);
    }
  }

  // -----------------------------------------------------------------------
  // Copy/paste styles
  // -----------------------------------------------------------------------

  const COPYABLE_STYLES = [
    "font-size", "font-weight", "font-family", "color", "background-color",
    "text-align", "line-height", "letter-spacing", "text-decoration",
    "text-transform", "border", "border-radius", "padding", "margin",
    "opacity", "box-shadow",
  ];

  function handleCopyStyles() {
    const el = selectedElRef.current;
    if (!el) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.defaultView) return;
    const cs = doc.defaultView.getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const prop of COPYABLE_STYLES) {
      styles[prop] = cs.getPropertyValue(prop);
    }
    copiedStylesRef.current = styles;
    setHasCopiedStyles(true);
  }

  function handlePasteStyles() {
    const el = selectedElRef.current;
    if (!el || !copiedStylesRef.current) return;
    pushUndoSnapshot();
    for (const [prop, value] of Object.entries(copiedStylesRef.current)) {
      el.style.setProperty(prop, value);
    }
    markDirty();
  }

  // -----------------------------------------------------------------------
  // Context menu + clipboard + group + rename + save-as-component
  // -----------------------------------------------------------------------

  function openContextMenu(el: HTMLElement, x: number, y: number) {
    selectElementInIframe(el);
    setContextMenu({ x, y, targetEl: el });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function handleCopyElement() {
    if (selectedElsRef.current.size > 1) {
      copiedHtmlRef.current = Array.from(selectedElsRef.current)
        .map(el => el.outerHTML)
        .join("<!--cc-multi-->");
      return;
    }
    const el = selectedElRef.current;
    if (!el) return;
    copiedHtmlRef.current = el.outerHTML;
  }

  function handlePasteElement() {
    const el = selectedElRef.current;
    const html = copiedHtmlRef.current;
    if (!el || !html) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    pushUndoSnapshot();

    const fragments = html.split("<!--cc-multi-->");
    let insertAfter = el;

    for (const fragment of fragments) {
      const temp = doc.createElement("div");
      // Trusted internal clipboard HTML (from our own copy operation) — safe to restore
      // eslint-disable-next-line no-unsanitized/property
      temp.innerHTML = fragment;
      const newEl = temp.firstElementChild as HTMLElement;
      if (!newEl) continue;
      insertAfter.parentNode?.insertBefore(newEl, insertAfter.nextSibling);
      insertAfter = newEl;
    }

    markDirty();
  }

  function handleGroupElement() {
    const els = Array.from(selectedElsRef.current);
    if (els.length > 1) {
      pushUndoSnapshot();
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const wrapper = doc.createElement("div");
      wrapper.style.padding = "8px";
      // Insert wrapper before first selected element
      els[0].parentNode?.insertBefore(wrapper, els[0]);
      // Move all selected into wrapper
      els.forEach(el => wrapper.appendChild(el));
      // Select the wrapper
      selectElementInIframe(wrapper);
      markDirty();
      return;
    }
    const el = selectedElRef.current;
    if (!el) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    pushUndoSnapshot();
    const wrapper = doc.createElement("div");
    wrapper.style.padding = "16px";
    el.parentNode?.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    selectElementInIframe(wrapper);
    markDirty();
  }

  function startRenameElement() {
    const el = selectedElRef.current;
    if (!el) return;
    setRenamingEl(el);
    closeContextMenu();
  }

  function handleRenameElement(newName: string) {
    const el = renamingEl;
    if (!el) return;
    pushUndoSnapshot();
    if (newName.trim()) {
      el.setAttribute("data-cc-name", newName.trim());
    } else {
      el.removeAttribute("data-cc-name");
    }
    setRenamingEl(null);
    markDirty();
  }

  function handleSaveAsComponent() {
    const el = selectedElRef.current;
    if (!el) return;
    // Clean editor attributes
    const clone = el.cloneNode(true) as HTMLElement;
    const editorAttrs = ["data-cc-selected", "data-cc-hover", "data-cc-editable", "contenteditable",
      "data-cc-img-highlight", "data-cc-media-highlight", "data-cc-video-placeholder",
      "data-cc-padded", "data-cc-pad-skip", "data-cc-hidden"];
    function cleanNode(node: Element) {
      editorAttrs.forEach(attr => node.removeAttribute(attr));
      node.querySelectorAll("*").forEach(child => {
        editorAttrs.forEach(attr => child.removeAttribute(attr));
      });
    }
    cleanNode(clone);
    setSaveComponentHtml(clone.outerHTML);
    setShowSaveComponentModal(true);
    closeContextMenu();
  }

  function insertSavedComponent(html: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    pushUndoSnapshot();
    const temp = doc.createElement("div");
    // Trusted saved-component HTML (from our own API) — safe to insert
    // eslint-disable-next-line no-unsanitized/property
    temp.innerHTML = html;
    const newEl = temp.firstElementChild as HTMLElement;
    if (!newEl) return;
    if (hasSelectedEl && selectedElRef.current) {
      selectedElRef.current.parentNode?.insertBefore(newEl, selectedElRef.current.nextSibling);
    } else {
      doc.body.appendChild(newEl);
    }
    selectElementInIframe(newEl);
    markDirty();
  }

  // -----------------------------------------------------------------------
  // Drag from components tab
  // -----------------------------------------------------------------------

  const dragComponentRef = useRef<
    | { type: "block"; blockId: string }
    | { type: "saved"; html: string }
    | null
  >(null);
  const [isDraggingFromComponents, setIsDraggingFromComponents] =
    useState(false);

  function insertAtPosition(
    target: HTMLElement,
    position: "before" | "after",
    payload:
      | { type: "block"; blockId: string }
      | { type: "saved"; html: string }
  ) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    pushUndoSnapshot();

    let newEl: HTMLElement;
    if (payload.type === "block") {
      const block = BLOCKS_MAP[payload.blockId];
      if (!block) return;
      newEl = block.insert(doc);
    } else {
      const temp = doc.createElement("div");
      // eslint-disable-next-line no-unsanitized/property
      temp.innerHTML = payload.html;
      newEl = temp.firstElementChild as HTMLElement;
      if (!newEl) return;
    }

    if (position === "before") {
      target.parentNode?.insertBefore(newEl, target);
    } else {
      target.parentNode?.insertBefore(newEl, target.nextSibling);
    }

    selectElementInIframe(newEl);
    markDirty();
  }

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  function selectElementInIframe(el: HTMLElement) {
    // Clear multi-select
    selectedElsRef.current.forEach(e => e.removeAttribute("data-cc-selected"));
    selectedElsRef.current.clear();
    // Deselect previous primary
    if (selectedElRef.current) {
      selectedElRef.current.removeAttribute("data-cc-selected");
    }
    el.setAttribute("data-cc-selected", "");
    selectedElRef.current = el;
    selectedElsRef.current.add(el);
    setMultiSelectCount(1);
    setHasSelectedEl(true);
    setLayersRefreshKey((k) => k + 1);
  }

  function deselectElement() {
    if (selectedElRef.current) {
      selectedElRef.current.removeAttribute("data-cc-selected");
      selectedElRef.current = null;
    }
    selectedElsRef.current.forEach(el => el.removeAttribute("data-cc-selected"));
    selectedElsRef.current.clear();
    setMultiSelectCount(0);
    setHasSelectedEl(false);
  }

  function reloadIframe() {
    setIframeKey((k) => k + 1);
  }

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  // Autosave cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSavedTimeoutRef.current)
        clearTimeout(autoSavedTimeoutRef.current);
    };
  }, []);

  // Saved timeout cleanup
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // Fetch market product URLs
  useEffect(() => {
    fetch("/api/market-urls")
      .then((r) => (r.ok ? r.json() : []))
      .then(setMarketUrls);
  }, []);

  // Fetch saved components on mount
  useEffect(() => {
    fetch("/api/saved-components")
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSavedComponents(data); })
      .catch(console.error);
  }, []);

  // Auto-detect URL mode when market URLs load and linkUrl is set
  useEffect(() => {
    if (marketUrls.length > 0 && linkUrl) {
      const match = filteredUrls.find((u) => u.url === linkUrl);
      setUrlMode(match ? "saved" : "custom");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketUrls.length, linkUrl]);

  // postMessage handler (cc-dirty, cc-image-click, cc-video-click)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "cc-dirty") {
        markDirty();
      }
      if (e.data?.type === "cc-image-click") {
        setClickedVideo(null);
        setClickedImage({
          src: e.data.src,
          index: e.data.index,
          width: e.data.width,
          height: e.data.height,
        });
        // Also select the image element so it highlights in canvas + layers
        const doc = iframeRef.current?.contentDocument;
        if (doc) {
          const imgs = doc.querySelectorAll("img");
          const imgEl = imgs[e.data.index] as HTMLElement | undefined;
          if (imgEl) selectElementInIframe(imgEl);
        }
      }
      if (e.data?.type === "cc-video-click") {
        setClickedImage(null);
        setClickedVideo({
          src: e.data.src,
          index: e.data.index,
          width: e.data.width,
          height: e.data.height,
        });
        // Also select the video element
        const doc = iframeRef.current?.contentDocument;
        if (doc) {
          const videos = doc.querySelectorAll("video");
          const videoEl = videos[e.data.index] as HTMLElement | undefined;
          if (videoEl) selectElementInIframe(videoEl);
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [markDirty]);

  // Before-unload warning
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty || bgImageTranslating) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, bgImageTranslating]);

  // Keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Shift+Z, Backspace/Delete, Ctrl+C/V/D/G, Ctrl+Shift+S)
  const saveRef = useRef<(() => void) | null>(null);
  saveRef.current = () => {
    if (!saving && !publishing && !retranslating) handleSave();
  };
  const undoRef = useRef<(() => void) | null>(null);
  const redoRef = useRef<(() => void) | null>(null);
  const deleteRef = useRef<(() => void) | null>(null);
  undoRef.current = handleUndo;
  redoRef.current = handleRedo;
  deleteRef.current = handleDeleteElement;

  // Refs for new callbacks (avoid stale closures in event listeners)
  const handleCopyElementRef = useRef(handleCopyElement);
  useEffect(() => { handleCopyElementRef.current = handleCopyElement; });
  const handlePasteElementRef = useRef(handlePasteElement);
  useEffect(() => { handlePasteElementRef.current = handlePasteElement; });
  const handleDuplicateElementRef = useRef(handleDuplicateElement);
  useEffect(() => { handleDuplicateElementRef.current = handleDuplicateElement; });
  const handleGroupElementRef = useRef(handleGroupElement);
  useEffect(() => { handleGroupElementRef.current = handleGroupElement; });
  const handleSaveAsComponentRef = useRef(handleSaveAsComponent);
  useEffect(() => { handleSaveAsComponentRef.current = handleSaveAsComponent; });

  // Context menu ref for keydown handler
  const contextMenuRef = useRef(contextMenu);
  useEffect(() => { contextMenuRef.current = contextMenu; });

  // Ref for openContextMenu (used in iframe listener)
  const openContextMenuRef = useRef(openContextMenu);
  useEffect(() => { openContextMenuRef.current = openContextMenu; });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable === true;

      // Escape -> close context menu, or go up one selection level
      if (e.key === "Escape") {
        if (contextMenuRef.current) {
          closeContextMenu();
          return;
        }
        // Escape with selection — select parent, or deselect at top level
        if (!isTyping && selectedElRef.current) {
          e.preventDefault();
          const doc = iframeRef.current?.contentDocument;
          const body = doc?.body;
          const parent = selectedElRef.current.parentElement;
          if (parent && parent !== body && parent.tagName !== "HTML") {
            // Select parent element
            selectedElsRef.current.forEach(el => el.removeAttribute("data-cc-selected"));
            selectedElsRef.current.clear();
            selectedElRef.current.removeAttribute("data-cc-selected");
            parent.setAttribute("data-cc-selected", "");
            selectedElRef.current = parent;
            selectedElsRef.current.add(parent);
            setMultiSelectCount(1);
            setHasSelectedEl(true);
            setLayersRefreshKey((k) => k + 1);
          } else {
            // At top level — deselect entirely
            selectedElRef.current.removeAttribute("data-cc-selected");
            selectedElRef.current = null;
            selectedElsRef.current.forEach(el => el.removeAttribute("data-cc-selected"));
            selectedElsRef.current.clear();
            setMultiSelectCount(0);
            setHasSelectedEl(false);
            setLayersRefreshKey((k) => k + 1);
          }
          return;
        }
      }

      // Ctrl/Cmd+C -> copy element (when not typing)
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && !isTyping) {
        handleCopyElementRef.current();
        // Don't preventDefault — allow normal text copy too
      }

      // Ctrl/Cmd+V -> paste element (when not typing, only if we have copied HTML)
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && !isTyping && copiedHtmlRef.current && selectedElRef.current) {
        e.preventDefault();
        handlePasteElementRef.current();
      }

      // Ctrl/Cmd+D -> duplicate (when not typing)
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && !isTyping) {
        e.preventDefault();
        handleDuplicateElementRef.current();
      }

      // Ctrl/Cmd+G -> group into container
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && !isTyping) {
        e.preventDefault();
        handleGroupElementRef.current();
      }

      // Ctrl/Cmd+Shift+S -> save as component (when not typing)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s" && !isTyping && selectedElRef.current) {
        e.preventDefault();
        handleSaveAsComponentRef.current();
        return; // Don't fall through to regular Ctrl+S
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redoRef.current?.();
      }
      if ((e.key === "Backspace" || e.key === "Delete") && !isTyping && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        deleteRef.current?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Exclude mode styling injection
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
      const target = e.target as HTMLElement;
      const padded = target.closest(
        "[data-cc-padded]"
      ) as HTMLElement | null;

      // Only prevent default and stop propagation if clicking on a padded element
      if (!padded) return;

      e.preventDefault();
      e.stopPropagation();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeMode]);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: BuilderContextValue = {
    // Props
    pageId,
    pageName,
    pageSlug,
    pageProduct,
    originalHtml,
    translation,
    language,
    variantLabel,
    isSource,

    // Router
    router,

    // Refs
    iframeRef,
    selectedElRef,

    // Core state
    seoTitle,
    setSeoTitle,
    seoDesc,
    setSeoDesc,
    saving,
    publishing,
    retranslating,
    saveError,
    setSaveError,
    saved,
    isDirty,
    setIsDirty,
    iframeKey,
    viewMode,
    setViewMode,

    // Padding
    padDH,
    padDV,
    padMH,
    padMV,
    excludeMode,
    setExcludeMode,
    excludeCount,

    // Modals
    showPublishModal,
    setShowPublishModal,
    showSettingsModal,
    setShowSettingsModal,

    // Quality
    fixingQuality,
    qualityScore,
    qualityAnalysis,
    analyzing,
    showQualityDetails,
    setShowQualityDetails,

    // Link / Slug
    linkUrl,
    slug,
    setSlug,

    // Media clicks
    clickedImage,
    setClickedImage,
    clickedVideo,
    setClickedVideo,
    bgImageTranslating,
    setBgImageTranslating,

    // Element selection
    hasSelectedEl,
    setHasSelectedEl,
    selectedElsRef,
    multiSelectCount,
    hiddenCount,
    revealHidden,
    layersRefreshKey,

    // Undo / redo
    undoCount,
    redoCount,

    // Autosave
    autoSaveStatus,

    // Market URLs
    marketUrls,
    urlMode,
    setUrlMode,
    filteredUrls,

    // Confirm dialog
    confirmAction,
    setConfirmAction,

    // New builder layout state
    zoom,
    setZoom,
    leftTab,
    setLeftTab,
    leftSidebarOpen,
    setLeftSidebarOpen,
    rightTab,
    setRightTab,
    rightPanelOpen,
    setRightPanelOpen,

    // Viewport configuration
    viewportConfig,
    setViewportConfig,

    // Link modal state
    showLinkModal,
    setShowLinkModal,

    // Callbacks
    triggerAutosave,
    pushUndoSnapshot,
    markDirty,
    handleHideElement,
    handleToggleLayerVisibility,
    handleUndo,
    handleRedo,
    handleDuplicateElement,
    handleDeleteElement,
    toggleRevealHidden,
    handleIframeLoad,
    syncPaddingToIframe,
    handlePaddingChange,
    handleLinkUrlChange,
    extractHtmlFromIframe,
    handleSave,
    handlePublish,
    handleRevert,
    requestRetranslate,
    runQualityAnalysis,
    handleFixQuality,
    doRetranslate,

    // Copy/paste styles
    handleCopyStyles,
    handlePasteStyles,
    hasCopiedStyles,

    // Context menu
    contextMenu,
    openContextMenu,
    closeContextMenu,

    // Clipboard (copy/paste elements)
    copiedHtmlRef,
    handleCopyElement,
    handlePasteElement,

    // Group
    handleGroupElement,

    // Rename
    renamingEl,
    setRenamingEl,
    startRenameElement,
    handleRenameElement,

    // Save as component
    showSaveComponentModal,
    setShowSaveComponentModal,
    saveComponentHtml,
    handleSaveAsComponent,
    savedComponents,
    setSavedComponents,
    insertSavedComponent,

    // Drag from components tab
    dragComponentRef,
    isDraggingFromComponents,
    setIsDraggingFromComponents,
    insertAtPosition,

    // Convenience methods
    selectElementInIframe,
    deselectElement,
    reloadIframe,
  };

  return (
    <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>
  );
}
