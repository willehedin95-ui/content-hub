"use client";

import { useState, useCallback, useRef } from "react";
import { useBuilder } from "../BuilderContext";
import { Loader2, Lightbulb, Sparkles, RefreshCw, X, Wand2, Undo2 } from "lucide-react";

type Scope = "element" | "section" | "page";

const SCOPE_LABELS: Record<Scope, string> = {
  element: "Selected element",
  section: "Parent section",
  page: "Whole page",
};

const QUICK_ACTIONS = [
  { label: "Shorten text", instruction: "Make all text content shorter and more concise. Cut unnecessary words, reduce paragraph length by ~40%. Keep the same meaning and tone." },
  { label: "More urgent", instruction: "Make the copy more urgent and action-oriented. Add urgency without being spammy. Use active voice, stronger verbs, and create a sense of immediacy." },
  { label: "Simpler language", instruction: "Simplify the language. Use shorter words, shorter sentences, 6th grade reading level. Remove jargon and complex phrasing." },
  { label: "Add social proof", instruction: "Where appropriate, weave in social proof elements (e.g. 'thousands of customers', 'verified by experts', '94% reported improvement'). Don't add new HTML elements, just enhance existing text." },
];

export default function AITab() {
  const {
    selectedElRef,
    iframeRef,
    hasSelectedEl,
    language,
    pageProduct,
    isSource,
    markDirty,
    pushUndoSnapshot,
    setLayersRefreshKey,
  } = useBuilder();

  // --- Free-form AI edit ---
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<Scope>("element");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [lastEdit, setLastEdit] = useState<{ el: HTMLElement; oldHtml: string } | null>(null);

  // --- Headline suggestions ---
  const [headlineSuggestions, setHeadlineSuggestions] = useState<
    { headline: string; mechanism: string }[]
  >([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(false);
  const [showHeadlinePanel, setShowHeadlinePanel] = useState(false);

  // --- Variation generation ---
  const [generatingVariation, setGeneratingVariation] = useState(false);
  const [showVariationMenu, setShowVariationMenu] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isHeading =
    selectedElRef.current &&
    ["H1", "H2", "H3"].includes(selectedElRef.current.tagName);

  // Resolve the target element based on scope
  function getTargetElement(): HTMLElement | null {
    const el = selectedElRef.current;
    if (!el) return null;

    if (scope === "element") return el;

    if (scope === "section") {
      // Walk up to find a section-like container
      const sectionTags = ["SECTION", "ARTICLE", "MAIN"];
      const sectionClasses = /section|block|container|wrapper|listicle/i;
      let parent = el.parentElement;
      let depth = 0;
      while (parent && depth < 8) {
        if (
          sectionTags.includes(parent.tagName) ||
          sectionClasses.test(parent.className || "")
        ) {
          return parent;
        }
        parent = parent.parentElement;
        depth++;
      }
      // Fallback: grandparent
      return el.parentElement?.parentElement || el.parentElement || el;
    }

    if (scope === "page") {
      const doc = iframeRef.current?.contentDocument;
      return doc?.body || el;
    }

    return el;
  }

  async function handleAIEdit(customInstruction?: string) {
    const target = getTargetElement();
    if (!target) return;

    const text = customInstruction || instruction.trim();
    if (!text) return;

    setEditing(true);
    setEditError("");

    try {
      pushUndoSnapshot();
      const oldHtml = target.innerHTML;

      const res = await fetch("/api/builder/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: target.innerHTML,
          instruction: text,
          language: isSource ? "English" : language.label,
          product: pageProduct || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.html) {
        setEditError(data.error || "AI edit failed");
        return;
      }

      target.innerHTML = data.html;
      setLastEdit({ el: target, oldHtml });
      markDirty();
      setLayersRefreshKey((k: number) => k + 1);
      if (!customInstruction) setInstruction("");
    } catch (err) {
      console.error("AI edit failed:", err);
      setEditError("Failed to connect to AI");
    } finally {
      setEditing(false);
    }
  }

  function handleUndoLastEdit() {
    if (!lastEdit) return;
    pushUndoSnapshot();
    lastEdit.el.innerHTML = lastEdit.oldHtml;
    markDirty();
    setLayersRefreshKey((k: number) => k + 1);
    setLastEdit(null);
  }

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

  const selectedText = selectedElRef.current?.textContent?.trim();
  const hasText = !!selectedText;

  return (
    <div className="space-y-0">
      {/* Free-form AI Edit — always shown */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-2">
          <Wand2 className="w-3 h-3" /> AI Edit
        </label>

        {/* Scope selector */}
        <div className="flex gap-0.5 bg-gray-100 rounded p-0.5 mb-2">
          {(["element", "section", "page"] as Scope[]).map((s) => (
            <button
              key={s}
              className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
                scope === s
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setScope(s)}
            >
              {s === "element" ? "Element" : s === "section" ? "Section" : "Page"}
            </button>
          ))}
        </div>

        {/* Scope description */}
        <p className="text-[10px] text-gray-400 mb-2">
          {hasSelectedEl
            ? `Editing: ${SCOPE_LABELS[scope]}`
            : "Select an element first"}
        </p>

        {/* Instruction input */}
        <textarea
          ref={textareaRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAIEdit();
            }
          }}
          placeholder='e.g. "Shorten all paragraphs" or "Make the tone more urgent"'
          rows={3}
          className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 placeholder:text-gray-400"
        />

        {/* Apply button */}
        <button
          onClick={() => handleAIEdit()}
          disabled={editing || !instruction.trim() || !hasSelectedEl}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-2 mt-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {editing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Editing...
            </>
          ) : (
            <>
              <Wand2 className="w-3 h-3" /> Apply Edit
              <span className="text-[10px] opacity-60 ml-1">⌘↵</span>
            </>
          )}
        </button>

        {/* Undo last edit */}
        {lastEdit && !editing && (
          <button
            onClick={handleUndoLastEdit}
            className="w-full flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 mt-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Undo2 className="w-3 h-3" /> Undo AI edit
          </button>
        )}

        {/* Error */}
        {editError && (
          <p className="text-xs text-red-500 mt-1.5">{editError}</p>
        )}

        {/* Quick actions */}
        <div className="mt-3">
          <span className="text-[10px] text-gray-400 uppercase font-medium">Quick actions</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleAIEdit(action.instruction)}
                disabled={editing || !hasSelectedEl}
                className="text-[10px] font-medium px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Headline Suggestions — only for h1/h2/h3 */}
      {hasSelectedEl && isHeading && hasText && (
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
      {hasSelectedEl && hasText && (
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
        </div>
      )}
    </div>
  );
}
