"use client";

import { useState, useCallback } from "react";
import { useBuilder } from "../BuilderContext";
import { Loader2, Lightbulb, Sparkles, RefreshCw, X } from "lucide-react";

export default function AITab() {
  const {
    selectedElRef,
    hasSelectedEl,
    language,
    pageProduct,
    isSource,
    markDirty,
    pushUndoSnapshot,
  } = useBuilder();

  // --- Headline suggestions ---
  const [headlineSuggestions, setHeadlineSuggestions] = useState<
    { headline: string; mechanism: string }[]
  >([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(false);
  const [showHeadlinePanel, setShowHeadlinePanel] = useState(false);

  // --- Variation generation ---
  const [generatingVariation, setGeneratingVariation] = useState(false);
  const [showVariationMenu, setShowVariationMenu] = useState(false);

  const isHeading =
    selectedElRef.current &&
    ["H1", "H2", "H3"].includes(selectedElRef.current.tagName);

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
          language: isSource ? "en" : language.value,
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
  }, [selectedElRef, isSource, language.value, pageProduct]);

  function applyHeadlineSuggestion(headline: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.textContent = headline;
    markDirty();
    setShowHeadlinePanel(false);
    setHeadlineSuggestions([]);
  }

  const handleGenerateVariation = useCallback(
    async (mode: "rewrite" | "hook_inspired") => {
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
            language: isSource ? "en" : language.value,
            product: pageProduct || null,
            mode,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.variation && el) {
          pushUndoSnapshot();
          el.textContent = data.variation;
          markDirty();
        }
      } catch (err) {
        console.error("Variation generation failed:", err);
      } finally {
        setGeneratingVariation(false);
      }
    },
    [selectedElRef, isSource, language.value, pageProduct, markDirty, pushUndoSnapshot]
  );

  if (!hasSelectedEl) return null;

  const selectedText = selectedElRef.current?.textContent?.trim();
  const hasText = !!selectedText;

  return (
    <div className="space-y-0">
      {/* Headline Suggestions — only for h1/h2/h3 */}
      {isHeading && hasText && (
        <div className="px-4 py-3 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-2">
            <Lightbulb className="w-3 h-3" /> Headline Ideas
          </label>
          <button
            onClick={handleSuggestHeadlines}
            disabled={loadingHeadlines}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {loadingHeadlines ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Generating
                headlines...
              </>
            ) : (
              <>
                <Lightbulb className="w-3 h-3" /> Suggest Headlines
              </>
            )}
          </button>
          {showHeadlinePanel && (
            <div className="mt-2 border border-amber-200 rounded-lg bg-amber-50/50 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-amber-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800">
                  Headline Ideas
                </span>
                <button
                  onClick={() => {
                    setShowHeadlinePanel(false);
                    setHeadlineSuggestions([]);
                  }}
                  className="text-amber-400 hover:text-amber-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {loadingHeadlines ? (
                <div className="px-3 py-4 flex items-center justify-center gap-2 text-xs text-amber-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating 6
                  variations...
                </div>
              ) : (
                <div className="divide-y divide-amber-100">
                  {headlineSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => applyHeadlineSuggestion(s.headline)}
                      className="w-full text-left px-3 py-2 hover:bg-amber-100/70 transition-colors group"
                    >
                      <p className="text-xs text-gray-900 leading-snug group-hover:text-amber-900">
                        {s.headline}
                      </p>
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

      {/* Generate Variation — for any text element */}
      {hasText && (
        <div className="px-4 py-3 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3" /> Copy Variation
          </label>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVariationMenu(!showVariationMenu);
              }}
              disabled={generatingVariation}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              {generatingVariation ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" /> Generate Variation
                </>
              )}
            </button>
            {showVariationMenu && !generatingVariation && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => handleGenerateVariation("rewrite")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">Rewrite</span>
                  <p className="text-gray-500 mt-0.5">
                    Same meaning, different words
                  </p>
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => handleGenerateVariation("hook_inspired")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">
                    Hook bank inspired
                  </span>
                  <p className="text-gray-500 mt-0.5">
                    Different angle from proven hooks
                  </p>
                </button>
              </div>
            )}
          </div>

          {/* Current text preview */}
          <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-100">
            <span className="text-[10px] text-gray-400 uppercase block mb-0.5">
              Selected text
            </span>
            <p className="text-xs text-gray-700 line-clamp-3">{selectedText}</p>
          </div>
        </div>
      )}

      {/* No text hint */}
      {!hasText && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-gray-400">
            Select a text element to use AI tools
          </p>
        </div>
      )}
    </div>
  );
}
