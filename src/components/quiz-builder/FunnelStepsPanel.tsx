"use client";
import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useQuiz } from "./QuizContext";
import { topoOrderSteps, addSubEl, removeSubEl } from "@/lib/quiz-graph";
import { PALETTE_ITEMS, type PaletteItem } from "./ElementPalette";
import type { SubEl } from "@/types/quiz";

// kind -> palette item (icon + label), for rendering element rows
const ITEM_BY_KIND = Object.fromEntries(
  PALETTE_ITEMS.map((i) => [i.kind, i]),
) as Record<PaletteItem["kind"], PaletteItem>;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Short one-line summary of an element, shown greyed next to its kind label. */
function elementSummary(el: SubEl): string {
  switch (el.kind) {
    case "title":
      return stripTags(el.text) || "Untitled";
    case "text":
      return stripTags(el.text) || "Empty";
    case "question": {
      const first = el.options[0]?.label;
      return first
        ? `${el.options.length} val · ${first}`
        : `${el.options.length} val`;
    }
    case "image":
      return el.alt || "Bild";
    case "custom_html":
      return "HTML";
    case "loading":
      return el.text || "Laddar";
    case "range_slider":
      return `{${el.variable}}`;
    case "text_input":
      return `{${el.variable}}`;
    case "testimonial_slider":
      return `${el.items.length} recensioner`;
  }
  return "";
}

function kindLabel(kind: SubEl["kind"]): string {
  return ITEM_BY_KIND[kind]?.label ?? kind;
}

export function FunnelStepsPanel({ onClose }: { onClose?: () => void }) {
  const {
    data,
    selectedNodeId,
    selectedElId,
    setSelectedNodeId,
    setSelectedElId,
    setData,
  } = useQuiz();
  const steps = topoOrderSteps(data);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedNodeId ? [selectedNodeId] : []),
  );
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  // After adding an element we can't know its id synchronously (addSubEl mints
  // it internally), so flag the step and select its new last element once the
  // data has updated.
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  // Keep the selected step expanded (e.g. when selected from the canvas).
  useEffect(() => {
    if (!selectedNodeId) return;
    setExpanded((prev) =>
      prev.has(selectedNodeId) ? prev : new Set(prev).add(selectedNodeId),
    );
  }, [selectedNodeId]);

  useEffect(() => {
    if (!pendingSelect) return;
    const step = data.nodes[pendingSelect];
    if (step && step.kind === "step" && step.subEls.length > 0) {
      const last = step.subEls[step.subEls.length - 1];
      setSelectedNodeId(pendingSelect);
      setSelectedElId(last.id);
    }
    setPendingSelect(null);
  }, [data, pendingSelect, setSelectedNodeId, setSelectedElId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectStep(id: string) {
    setSelectedNodeId(id);
    setSelectedElId(null);
    setExpanded((prev) => new Set(prev).add(id));
  }
  function selectEl(stepId: string, elId: string) {
    setSelectedNodeId(stepId);
    setSelectedElId(elId);
  }
  function addElement(stepId: string, kind: PaletteItem["kind"]) {
    setData((prev) => addSubEl(prev, stepId, { kind }));
    setAddMenuFor(null);
    setPendingSelect(stepId);
  }
  function deleteEl(stepId: string, elId: string) {
    setData((prev) => removeSubEl(prev, stepId, elId));
    if (selectedElId === elId) setSelectedElId(null);
  }

  return (
    <aside className="w-[280px] border-r border-gray-200 bg-white shrink-0 flex flex-col min-h-0">
      <div className="h-10 pl-4 pr-2 flex items-center justify-between border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-800">Funnel Steps</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close Funnel Steps panel"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {steps.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-2 py-3">No steps yet</p>
        ) : (
          <ol className="space-y-0.5">
            {steps.map((step, i) => {
              const isOpen = expanded.has(step.id);
              const stepSelected = selectedNodeId === step.id && !selectedElId;
              return (
                <li key={step.id}>
                  {/* Step header row */}
                  <div
                    className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
                      stepSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(step.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectStep(step.id)}
                      className="flex-1 flex items-center gap-2 py-2 text-left min-w-0"
                    >
                      <span
                        className={`text-xs font-mono w-4 text-center shrink-0 ${
                          stepSelected ? "text-indigo-500" : "text-gray-400"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`text-sm truncate ${
                          stepSelected
                            ? "text-indigo-900 font-medium"
                            : "text-gray-700"
                        }`}
                      >
                        {step.name}
                      </span>
                    </button>
                    {step.variantGroupId && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded shrink-0">
                        A/B
                      </span>
                    )}
                  </div>

                  {/* Elements */}
                  {isOpen && (
                    <div className="ml-4 mt-0.5 mb-1 pl-2 border-l border-gray-100 space-y-0.5">
                      {step.subEls.map((el) => {
                        const Item = ITEM_BY_KIND[el.kind];
                        const Icon = Item?.Icon;
                        const isSel = selectedElId === el.id;
                        return (
                          <div
                            key={el.id}
                            className={`group flex items-center rounded-md transition-colors ${
                              isSel ? "bg-indigo-100" : "hover:bg-gray-50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => selectEl(step.id, el.id)}
                              className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left min-w-0"
                            >
                              {Icon && (
                                <Icon
                                  size={13}
                                  className={`shrink-0 ${
                                    isSel ? "text-indigo-600" : "text-gray-400"
                                  }`}
                                />
                              )}
                              <span
                                className={`text-xs font-medium shrink-0 ${
                                  isSel ? "text-indigo-800" : "text-gray-600"
                                }`}
                              >
                                {kindLabel(el.kind)}
                              </span>
                              <span className="text-xs text-gray-400 truncate min-w-0">
                                {elementSummary(el)}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteEl(step.id, el.id)}
                              className="p-1 mr-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              aria-label="Delete element"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                      {step.subEls.length === 0 && (
                        <p className="text-xs text-gray-400 italic px-2 py-1">
                          No elements yet
                        </p>
                      )}

                      {/* + New Element */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setAddMenuFor((cur) => (cur === step.id ? null : step.id))
                          }
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                          <Plus size={13} />
                          New element
                        </button>
                        {addMenuFor === step.id && (
                          <>
                            {/* click-away backdrop */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setAddMenuFor(null)}
                            />
                            <div className="absolute z-20 left-2 mt-0.5 w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1">
                              {PALETTE_ITEMS.map(({ kind, label, Icon }) => (
                                <button
                                  key={kind}
                                  type="button"
                                  onClick={() => addElement(step.id, kind)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                >
                                  <Icon size={14} className="text-gray-400" />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
