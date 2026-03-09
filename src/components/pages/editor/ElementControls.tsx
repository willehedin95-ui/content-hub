"use client";

import { useState, useEffect, useCallback, RefObject } from "react";
import {
  MoveHorizontal,
  MoveVertical,
  Loader2,
  Sparkles,
  Lightbulb,
  EyeOff,
  Trash2,
  RefreshCw,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Type,
  Image,
  MousePointerClick,
  Minus,
  Copy,
  Link2,
  Video,
} from "lucide-react";

interface Props {
  selectedElRef: RefObject<HTMLElement | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  hasSelectedEl: boolean;
  onDeselect: () => void;
  onHide: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  markDirty: () => void;
  isSource?: boolean;
  languageValue: string;
  pageProduct?: string;
}

const numInputClass =
  "w-full bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export default function ElementControls({
  selectedElRef,
  iframeRef,
  hasSelectedEl,
  onDeselect,
  onHide,
  onDelete,
  onDuplicate,
  markDirty,
  isSource,
  languageValue,
  pageProduct,
}: Props) {
  // Spacing
  const [spacingMode, setSpacingMode] = useState<"hv" | "individual">("hv");
  const [margin, setMargin] = useState({ top: "", right: "", bottom: "", left: "" });
  const [padding, setPadding] = useState({ top: "", right: "", bottom: "", left: "" });

  // Typography
  const [fontSize, setFontSize] = useState("");
  const [fontWeight, setFontWeight] = useState("");
  const [textColor, setTextColor] = useState("#000000");
  const [textAlign, setTextAlign] = useState("");
  const [lineHeight, setLineHeight] = useState("");
  const [bgColor, setBgColor] = useState("");

  // AI features
  const [headlineSuggestions, setHeadlineSuggestions] = useState<{ headline: string; mechanism: string }[]>([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(false);
  const [showHeadlinePanel, setShowHeadlinePanel] = useState(false);
  const [generatingVariation, setGeneratingVariation] = useState(false);
  const [showVariationMenu, setShowVariationMenu] = useState(false);

  // Read computed styles when element changes
  useEffect(() => {
    const el = selectedElRef.current;
    if (!el || !hasSelectedEl) return;

    const doc = iframeRef.current?.contentDocument;
    const win = doc?.defaultView;
    if (!win) return;

    const cs = win.getComputedStyle(el);

    // Margin
    setMargin({
      top: String(parseInt(cs.marginTop) || 0),
      right: String(parseInt(cs.marginRight) || 0),
      bottom: String(parseInt(cs.marginBottom) || 0),
      left: String(parseInt(cs.marginLeft) || 0),
    });

    // Padding
    setPadding({
      top: String(parseInt(cs.paddingTop) || 0),
      right: String(parseInt(cs.paddingRight) || 0),
      bottom: String(parseInt(cs.paddingBottom) || 0),
      left: String(parseInt(cs.paddingLeft) || 0),
    });

    // Typography
    setFontSize(String(parseInt(cs.fontSize) || 16));
    setFontWeight(cs.fontWeight);
    const rgb = cs.color;
    setTextColor(rgbToHex(rgb));
    setTextAlign(cs.textAlign);
    const lh = cs.lineHeight;
    const fs = parseInt(cs.fontSize) || 16;
    setLineHeight(lh === "normal" ? "" : String((parseFloat(lh) / fs).toFixed(2)));

    // Background
    const bg = cs.backgroundColor;
    setBgColor(bg === "rgba(0, 0, 0, 0)" || bg === "transparent" ? "" : rgbToHex(bg));

    // Reset UI state
    setSpacingMode("hv");
    setShowHeadlinePanel(false);
    setHeadlineSuggestions([]);
    setShowVariationMenu(false);
  }, [hasSelectedEl, selectedElRef, iframeRef]);

  // --- Spacing handlers ---
  function handleMarginChange(side: "top" | "right" | "bottom" | "left", value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setMargin(prev => ({ ...prev, [side]: value }));
    const prop = `margin${side.charAt(0).toUpperCase() + side.slice(1)}`;
    el.style.setProperty(prop.replace(/([A-Z])/g, "-$1").toLowerCase(), value !== "" ? `${value}px` : "");
    markDirty();
  }

  function handleMarginHV(axis: "h" | "v", value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    if (axis === "h") {
      setMargin(prev => ({ ...prev, left: value, right: value }));
      el.style.marginLeft = value !== "" ? `${value}px` : "";
      el.style.marginRight = value !== "" ? `${value}px` : "";
    } else {
      setMargin(prev => ({ ...prev, top: value, bottom: value }));
      el.style.marginTop = value !== "" ? `${value}px` : "";
      el.style.marginBottom = value !== "" ? `${value}px` : "";
    }
    markDirty();
  }

  function handlePaddingChange(side: "top" | "right" | "bottom" | "left", value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setPadding(prev => ({ ...prev, [side]: value }));
    const prop = `padding${side.charAt(0).toUpperCase() + side.slice(1)}`;
    el.style.setProperty(prop.replace(/([A-Z])/g, "-$1").toLowerCase(), value !== "" ? `${value}px` : "");
    markDirty();
  }

  function handlePaddingHV(axis: "h" | "v", value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    if (axis === "h") {
      setPadding(prev => ({ ...prev, left: value, right: value }));
      el.style.paddingLeft = value !== "" ? `${value}px` : "";
      el.style.paddingRight = value !== "" ? `${value}px` : "";
    } else {
      setPadding(prev => ({ ...prev, top: value, bottom: value }));
      el.style.paddingTop = value !== "" ? `${value}px` : "";
      el.style.paddingBottom = value !== "" ? `${value}px` : "";
    }
    markDirty();
  }

  // --- Typography handlers ---
  function handleFontSizeChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setFontSize(value);
    el.style.fontSize = value !== "" ? `${value}px` : "";
    markDirty();
  }

  function handleFontWeightChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setFontWeight(value);
    el.style.fontWeight = value;
    markDirty();
  }

  function handleTextColorChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setTextColor(value);
    el.style.color = value;
    markDirty();
  }

  function handleTextAlignChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setTextAlign(value);
    el.style.textAlign = value;
    markDirty();
  }

  function handleLineHeightChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setLineHeight(value);
    el.style.lineHeight = value !== "" ? value : "";
    markDirty();
  }

  function handleBgColorChange(value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    setBgColor(value);
    el.style.backgroundColor = value || "";
    markDirty();
  }

  // --- AI features ---
  const handleGenerateVariation = useCallback(async (mode: "rewrite" | "hook_inspired") => {
    const el = selectedElRef.current;
    if (!el) return;
    const originalText = el.textContent?.trim();
    if (!originalText) return;

    setGeneratingVariation(true);
    setShowVariationMenu(false);
    try {
      const res = await fetch("/api/hooks/generate-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: originalText,
          language: isSource ? "en" : languageValue,
          product: pageProduct || null,
          mode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.variation && el) {
        el.textContent = data.variation;
        markDirty();
      }
    } catch (err) {
      console.error("Variation generation failed:", err);
    } finally {
      setGeneratingVariation(false);
    }
  }, [selectedElRef, isSource, languageValue, pageProduct, markDirty]);

  const handleSuggestHeadlines = useCallback(async () => {
    const el = selectedElRef.current;
    if (!el) return;
    const originalText = el.textContent?.trim();
    if (!originalText) return;

    setLoadingHeadlines(true);
    setShowHeadlinePanel(true);
    setHeadlineSuggestions([]);
    try {
      const res = await fetch("/api/headlines/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: originalText,
          language: isSource ? "en" : languageValue,
          product: pageProduct || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.suggestions) {
        setHeadlineSuggestions(data.suggestions);
      }
    } catch (err) {
      console.error("Headline suggestion failed:", err);
    } finally {
      setLoadingHeadlines(false);
    }
  }, [selectedElRef, isSource, languageValue, pageProduct]);

  function applyHeadlineSuggestion(headline: string) {
    const el = selectedElRef.current;
    if (!el) return;
    el.textContent = headline;
    markDirty();
    setShowHeadlinePanel(false);
    setHeadlineSuggestions([]);
  }

  // --- Insert block ---
  function insertBlock(type: "text" | "image" | "video" | "cta" | "divider", position: "before" | "after") {
    const el = selectedElRef.current;
    const doc = iframeRef.current?.contentDocument;
    if (!el || !doc) return;

    let newEl: HTMLElement;

    switch (type) {
      case "text": {
        newEl = doc.createElement("p");
        newEl.textContent = "New text block — click to edit";
        newEl.style.cssText = "font-size: 16px; line-height: 1.6; color: #333; margin: 16px 0; padding: 0 16px;";
        newEl.setAttribute("contenteditable", "true");
        break;
      }
      case "image": {
        newEl = doc.createElement("img");
        (newEl as HTMLImageElement).src = "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" fill="#f3f4f6"><rect width="600" height="400"/><text x="300" y="200" text-anchor="middle" fill="#9ca3af" font-size="20" font-family="sans-serif">Click to replace image</text></svg>'
        );
        (newEl as HTMLImageElement).alt = "Placeholder";
        newEl.style.cssText = "width: 100%; height: auto; display: block; margin: 16px 0;";
        break;
      }
      case "video": {
        newEl = doc.createElement("video");
        (newEl as HTMLVideoElement).controls = true;
        (newEl as HTMLVideoElement).playsInline = true;
        (newEl as HTMLVideoElement).loop = true;
        (newEl as HTMLVideoElement).muted = true;
        newEl.style.cssText = "width: 100%; height: auto; display: block; margin: 16px 0; background: #f3f4f6; min-height: 200px;";
        newEl.setAttribute("data-cc-video-placeholder", "true");
        break;
      }
      case "cta": {
        newEl = doc.createElement("a");
        (newEl as HTMLAnchorElement).href = "#";
        newEl.textContent = "Call to Action";
        newEl.style.cssText = "display: inline-block; background: #4f46e5; color: #fff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; text-align: center; margin: 16px auto; cursor: pointer;";
        newEl.setAttribute("contenteditable", "true");
        break;
      }
      case "divider": {
        newEl = doc.createElement("hr");
        newEl.style.cssText = "border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;";
        break;
      }
    }

    if (position === "before") {
      el.parentNode?.insertBefore(newEl, el);
    } else {
      el.parentNode?.insertBefore(newEl, el.nextSibling);
    }

    markDirty();
  }

  // --- Link editor state ---
  const [linkHref, setLinkHref] = useState("");
  const el = selectedElRef.current;
  const linkEl = el?.tagName === "A" ? el as HTMLAnchorElement : el?.closest("a") as HTMLAnchorElement | null;
  const isLink = !!linkEl;

  // Sync link href from DOM on element selection
  useEffect(() => {
    if (linkEl) {
      setLinkHref(linkEl.getAttribute("href") || "");
    }
  }, [linkEl, hasSelectedEl]);

  function handleLinkHrefChange(newHref: string) {
    setLinkHref(newHref);
    if (linkEl) {
      linkEl.setAttribute("href", newHref);
      markDirty();
    }
  }

  if (!hasSelectedEl) return null;

  const isHeading = selectedElRef.current && ["H1", "H2", "H3"].includes(selectedElRef.current.tagName);

  return (
    <>
      <div className="px-4 py-3 space-y-3 bg-indigo-50/50">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            Element
          </p>
          <button
            onClick={onDeselect}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Deselect
          </button>
        </div>

        {/* Margin */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500 uppercase tracking-wider">Margin</label>
            <button
              onClick={() => setSpacingMode(spacingMode === "hv" ? "individual" : "hv")}
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              {spacingMode === "hv" ? "T R B L" : "H / V"}
            </button>
          </div>
          {spacingMode === "hv" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <MoveHorizontal className="w-3 h-3 text-gray-400 shrink-0" />
                <input
                  type="number"
                  value={margin.left === margin.right ? margin.left : ""}
                  onChange={(e) => handleMarginHV("h", e.target.value)}
                  placeholder="—"
                  className={numInputClass}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <MoveVertical className="w-3 h-3 text-gray-400 shrink-0" />
                <input
                  type="number"
                  value={margin.top === margin.bottom ? margin.top : ""}
                  onChange={(e) => handleMarginHV("v", e.target.value)}
                  placeholder="—"
                  className={numInputClass}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {(["top", "right", "bottom", "left"] as const).map(side => (
                <div key={side} className="space-y-0.5">
                  <span className="text-xs text-gray-400 uppercase block text-center">{side[0].toUpperCase()}</span>
                  <input
                    type="number"
                    value={margin[side]}
                    onChange={(e) => handleMarginChange(side, e.target.value)}
                    className={numInputClass}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Padding */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500 uppercase tracking-wider">Padding</label>
          {spacingMode === "hv" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <MoveHorizontal className="w-3 h-3 text-gray-400 shrink-0" />
                <input
                  type="number"
                  value={padding.left === padding.right ? padding.left : ""}
                  onChange={(e) => handlePaddingHV("h", e.target.value)}
                  placeholder="—"
                  className={numInputClass}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <MoveVertical className="w-3 h-3 text-gray-400 shrink-0" />
                <input
                  type="number"
                  value={padding.top === padding.bottom ? padding.top : ""}
                  onChange={(e) => handlePaddingHV("v", e.target.value)}
                  placeholder="—"
                  className={numInputClass}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {(["top", "right", "bottom", "left"] as const).map(side => (
                <div key={side} className="space-y-0.5">
                  <span className="text-xs text-gray-400 uppercase block text-center">{side[0].toUpperCase()}</span>
                  <input
                    type="number"
                    value={padding[side]}
                    onChange={(e) => handlePaddingChange(side, e.target.value)}
                    className={numInputClass}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-indigo-100" />

        {/* Typography */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500 uppercase tracking-wider">Typography</label>

          {/* Font size + weight row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-gray-400 shrink-0">Sz</span>
              <input
                type="number"
                min="8"
                max="120"
                value={fontSize}
                onChange={(e) => handleFontSizeChange(e.target.value)}
                className={numInputClass}
              />
            </div>
            <select
              value={fontWeight}
              onChange={(e) => handleFontWeightChange(e.target.value)}
              className="flex-1 bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="300">Light</option>
              <option value="400">Normal</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra Bold</option>
            </select>
          </div>

          {/* Color + Line height row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 flex-1">
              <input
                type="color"
                value={textColor}
                onChange={(e) => handleTextColorChange(e.target.value)}
                className="w-6 h-6 rounded border border-gray-300 cursor-pointer shrink-0 p-0"
              />
              <input
                type="text"
                value={textColor}
                onChange={(e) => handleTextColorChange(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1 w-20">
              <span className="text-[10px] text-gray-400 shrink-0">LH</span>
              <input
                type="number"
                min="0.5"
                max="4"
                step="0.1"
                value={lineHeight}
                onChange={(e) => handleLineHeightChange(e.target.value)}
                placeholder="—"
                className={numInputClass}
              />
            </div>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-1">
            {([
              { value: "left", icon: AlignLeft },
              { value: "center", icon: AlignCenter },
              { value: "right", icon: AlignRight },
            ] as const).map(({ value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => handleTextAlignChange(value)}
                className={`flex-1 flex items-center justify-center py-1.5 rounded border text-xs transition-colors ${
                  textAlign === value
                    ? "bg-indigo-50 border-indigo-300 text-indigo-600"
                    : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* Background color */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 shrink-0">BG</span>
            <input
              type="color"
              value={bgColor || "#ffffff"}
              onChange={(e) => handleBgColorChange(e.target.value)}
              className="w-6 h-6 rounded border border-gray-300 cursor-pointer shrink-0 p-0"
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => handleBgColorChange(e.target.value)}
              placeholder="transparent"
              className="flex-1 bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
            {bgColor && (
              <button
                onClick={() => handleBgColorChange("")}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Link editor — only for <a> tags */}
        {isLink && (
          <>
            <div className="border-t border-indigo-100" />
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Link URL
              </label>
              <input
                type="text"
                value={linkHref}
                onChange={(e) => handleLinkHrefChange(e.target.value)}
                placeholder="https://..."
                className="w-full bg-white border border-gray-300 text-gray-900 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </>
        )}

        <div className="border-t border-indigo-100" />

        {/* Headline suggestions — only for h1/h2/h3 */}
        {isHeading && (
          <div>
            <button
              onClick={handleSuggestHeadlines}
              disabled={loadingHeadlines}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {loadingHeadlines ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Generating headlines...</>
              ) : (
                <><Lightbulb className="w-3 h-3" /> Suggest Headlines</>
              )}
            </button>
            {showHeadlinePanel && (
              <div className="mt-2 border border-amber-200 rounded-lg bg-amber-50/50 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-amber-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">Headline Ideas</span>
                  <button
                    onClick={() => { setShowHeadlinePanel(false); setHeadlineSuggestions([]); }}
                    className="text-amber-400 hover:text-amber-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {loadingHeadlines ? (
                  <div className="px-3 py-4 flex items-center justify-center gap-2 text-xs text-amber-600">
                    <Loader2 className="w-3 h-3 animate-spin" /> Generating 6 variations...
                  </div>
                ) : (
                  <div className="divide-y divide-amber-100">
                    {headlineSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => applyHeadlineSuggestion(s.headline)}
                        className="w-full text-left px-3 py-2 hover:bg-amber-100/70 transition-colors group"
                      >
                        <p className="text-xs text-gray-900 leading-snug group-hover:text-amber-900">{s.headline}</p>
                        <span className="inline-block mt-1 text-[10px] font-medium text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">
                          {s.mechanism}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={handleSuggestHeadlines}
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-amber-600 hover:bg-amber-100/70 transition-colors font-medium"
                    >
                      <RefreshCw className="w-3 h-3" /> More suggestions
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Generate Variation */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowVariationMenu(!showVariationMenu); }}
            disabled={generatingVariation}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {generatingVariation ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="w-3 h-3" /> Generate Variation</>
            )}
          </button>
          {showVariationMenu && !generatingVariation && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
              <button
                onClick={() => handleGenerateVariation("rewrite")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">Rewrite</span>
                <p className="text-gray-500 mt-0.5">Same meaning, different words</p>
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => handleGenerateVariation("hook_inspired")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">Hook bank inspired</span>
                <p className="text-gray-500 mt-0.5">Different angle from proven hooks</p>
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-indigo-100" />

        {/* Insert Block */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500 uppercase tracking-wider">Insert Block</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => insertBlock("text", "before")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert text before"
            >
              <Plus className="w-2.5 h-2.5" /><Type className="w-3 h-3" /> Before
            </button>
            <button
              onClick={() => insertBlock("text", "after")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert text after"
            >
              <Plus className="w-2.5 h-2.5" /><Type className="w-3 h-3" /> After
            </button>
            <button
              onClick={() => insertBlock("image", "after")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert image"
            >
              <Plus className="w-2.5 h-2.5" /><Image className="w-3 h-3" /> Image
            </button>
            <button
              onClick={() => insertBlock("cta", "after")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert CTA button"
            >
              <Plus className="w-2.5 h-2.5" /><MousePointerClick className="w-3 h-3" /> CTA
            </button>
            <button
              onClick={() => insertBlock("video", "after")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert video"
            >
              <Plus className="w-2.5 h-2.5" /><Video className="w-3 h-3" /> Video
            </button>
            <button
              onClick={() => insertBlock("divider", "after")}
              className="flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              title="Insert divider"
            >
              <Plus className="w-2.5 h-2.5" /><Minus className="w-3 h-3" /> Divider
            </button>
          </div>
        </div>

        <div className="border-t border-indigo-100" />

        {/* Duplicate + Hide + Delete */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onDuplicate}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Duplicate element"
          >
            <Copy className="w-3 h-3" /> Clone
          </button>
          <button
            onClick={onHide}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            <EyeOff className="w-3 h-3" /> Hide
          </button>
          <button
            onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      <div className="border-t border-gray-200" />
    </>
  );
}

/** Convert rgb(r, g, b) string to hex */
function rgbToHex(rgb: string): string {
  const match = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}
