"use client";
import { useQuiz } from "./QuizContext";
import { ElementPalette } from "./ElementPalette";
import { updateSubEl, removeSubEl, addOption, updateOption, removeOption, setOptionRoute, ensureDefaultEdge, topoOrderSteps } from "@/lib/quiz-graph";
import type { SubEl } from "@/types/quiz";
import { Trash2, PlusCircle, X, GitBranch } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared style atoms
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 placeholder:text-gray-400";
const labelBase = "block text-xs font-medium text-gray-500 mb-1";
const deleteBtn =
  "flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors mt-2 py-0.5";

// ---------------------------------------------------------------------------
// Delete button shared across all subEl editors
// ---------------------------------------------------------------------------

function DeleteElButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={deleteBtn} aria-label="Delete element">
      <Trash2 size={12} />
      Delete element
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-kind SubEl editors
// ---------------------------------------------------------------------------

type EditorProps = {
  el: SubEl;
  stepId: string;
};

function TitleEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "title") return null;
  const { data, setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <div className="flex items-center justify-between mb-1">
        <span className={labelBase}>Title</span>
      </div>
      <input
        type="text"
        value={el.text}
        onChange={(e) =>
          setData((prev) => updateSubEl(prev, stepId, el.id, { text: e.target.value }))
        }
        placeholder="Enter title text"
        className={`${inputBase} text-base font-semibold`}
      />
      <p className="text-[11px] text-gray-400 mt-1">
        Tip: use <code className="px-1 py-px rounded bg-gray-100 text-[10px]">{"{varName}"}</code> to insert a captured answer.
      </p>
      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

function TextEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "text") return null;
  const { setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Text</span>
      <textarea
        value={el.text}
        onChange={(e) =>
          setData((prev) => updateSubEl(prev, stepId, el.id, { text: e.target.value }))
        }
        placeholder="Enter paragraph text"
        rows={3}
        className={`${inputBase} resize-y`}
      />
      <p className="text-[11px] text-gray-400 mt-1">
        Tip: use <code className="px-1 py-px rounded bg-gray-100 text-[10px]">{"{varName}"}</code> to insert a captured answer.
      </p>
      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

function ImageEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "image") return null;
  const { setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Image</span>
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="shrink-0 w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center">
          {el.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={el.url}
              alt={el.alt || "preview"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-gray-400 text-center px-1">No image</span>
          )}
        </div>
        {/* Inputs */}
        <div className="flex-1 flex flex-col gap-2">
          <div>
            <label className={labelBase}>Image URL</label>
            <input
              type="text"
              value={el.url}
              onChange={(e) =>
                setData((prev) => updateSubEl(prev, stepId, el.id, { url: e.target.value }))
              }
              placeholder="https://example.com/image.jpg"
              className={inputBase}
            />
          </div>
          <div>
            <label className={labelBase}>Alt text</label>
            <input
              type="text"
              value={el.alt}
              onChange={(e) =>
                setData((prev) => updateSubEl(prev, stepId, el.id, { alt: e.target.value }))
              }
              placeholder="Describe the image"
              className={inputBase}
            />
          </div>
        </div>
      </div>
      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoutingEditor — per-option routing section inside QuestionEditor
// ---------------------------------------------------------------------------

type RoutingEditorProps = {
  el: Extract<SubEl, { kind: "question" }>;
  stepId: string;
};

function RoutingEditor({ el, stepId }: RoutingEditorProps) {
  const { data, setData } = useQuiz();

  // Build list of valid targets: all step nodes + exit nodes (excluding current step)
  const orderedSteps = topoOrderSteps(data);
  const exitNodes = Object.values(data.nodes).filter((n) => n.kind === "exit");

  const allTargets = [
    ...orderedSteps.filter((s) => s.id !== stepId).map((s) => ({ id: s.id, label: s.name, kind: "step" as const })),
    ...exitNodes.map((n) => ({ id: n.id, label: n.kind === "exit" ? n.name : "Exit", kind: "exit" as const })),
  ];

  // Find the current conditional target for each option
  function getOptionTarget(optionId: string): string {
    const edge = Object.values(data.edges).find(
      (e) =>
        e.from === stepId &&
        e.condition?.kind === "option" &&
        e.condition.questionElId === el.id &&
        e.condition.optionId === optionId,
    );
    return edge?.to ?? "";
  }

  function handleRouteChange(optionId: string, targetId: string) {
    setData((prev) => {
      if (!targetId) {
        // Revert to default - remove conditional edge
        return setOptionRoute(prev, stepId, el.id, optionId, null);
      }
      // Set conditional edge; also ensure a default edge exists so non-matching options still work
      let next = setOptionRoute(prev, stepId, el.id, optionId, targetId);
      // If there's no default edge from this step, create one to the first option's target
      const hasDefault = Object.values(next.edges).some(
        (e) => e.from === stepId && (!e.condition || e.condition.kind === "default"),
      );
      if (!hasDefault && allTargets.length > 0) {
        next = ensureDefaultEdge(next, stepId, allTargets[0].id);
      }
      return next;
    });
  }

  if (el.options.length === 0 || allTargets.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-center gap-1.5 mb-2">
        <GitBranch size={12} className="text-indigo-500" />
        <span className="text-xs font-medium text-gray-500">Routing (per option)</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {el.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i); // A, B, C…
          return (
            <div key={opt.id} className="flex items-center gap-2">
              <span
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-indigo-100 text-indigo-700 text-xs font-bold"
                title={opt.label}
              >
                {letter}
              </span>
              <span className="text-xs text-gray-600 flex-1 truncate min-w-0" title={opt.label}>
                {opt.label || <em className="text-gray-400">unlabeled</em>}
              </span>
              <select
                value={getOptionTarget(opt.id)}
                onChange={(e) => handleRouteChange(opt.id, e.target.value)}
                className="shrink-0 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-[120px]"
              >
                <option value="">default</option>
                {allTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.kind === "exit" ? `↳ ${t.label}` : t.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        &ldquo;default&rdquo; follows the default outgoing edge from this step.
      </p>
    </div>
  );
}

function QuestionEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "question") return null;
  const { setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Question</span>

      {/* kindOf toggle */}
      <div className="flex gap-2 mb-3">
        {(["single", "multi"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() =>
              setData((prev) => updateSubEl(prev, stepId, el.id, { kindOf: k }))
            }
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              el.kindOf === k
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {k === "single" ? "Single choice" : "Multi choice"}
          </button>
        ))}
      </div>

      {/* Options */}
      <div className="flex flex-col gap-1.5 mb-2">
        {el.options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-1.5">
            <input
              type="text"
              value={opt.label}
              onChange={(e) =>
                setData((prev) =>
                  updateOption(prev, stepId, el.id, opt.id, { label: e.target.value }),
                )
              }
              placeholder="Option label"
              className={`${inputBase} flex-1`}
            />
            <button
              type="button"
              onClick={() =>
                setData((prev) => removeOption(prev, stepId, el.id, opt.id))
              }
              className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
              aria-label={`Remove option ${opt.label}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add option */}
      <button
        type="button"
        onClick={() => setData((prev) => addOption(prev, stepId, el.id, ""))}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
      >
        <PlusCircle size={13} />
        Add option
      </button>

      {/* Conditional routing per option */}
      <RoutingEditor el={el} stepId={stepId} />

      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

function CustomHtmlEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "custom_html") return null;
  const { setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-dashed border-gray-300 rounded-md bg-gray-50">
      <span className={labelBase}>Custom HTML</span>
      <textarea
        value={el.html}
        onChange={(e) =>
          setData((prev) => updateSubEl(prev, stepId, el.id, { html: e.target.value }))
        }
        placeholder="<div>Your HTML here</div>"
        rows={4}
        spellCheck={false}
        className={`${inputBase} font-mono text-xs resize-y`}
      />
      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

function LoadingEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "loading") return null;
  const { setData } = useQuiz();
  return (
    <div className="mb-3 p-3 border border-dashed border-gray-300 rounded-md bg-gray-50">
      <span className={labelBase}>Loading</span>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelBase}>Message</label>
          <input
            type="text"
            value={el.text}
            onChange={(e) =>
              setData((prev) => updateSubEl(prev, stepId, el.id, { text: e.target.value }))
            }
            placeholder="Loading..."
            className={inputBase}
          />
        </div>
        <div className="w-20 shrink-0">
          <label className={labelBase}>Seconds</label>
          <input
            type="number"
            min={1}
            max={60}
            value={el.seconds}
            onChange={(e) => {
              const seconds = Math.max(1, parseInt(e.target.value, 10) || 1);
              setData((prev) => updateSubEl(prev, stepId, el.id, { seconds }));
            }}
            className={inputBase}
          />
        </div>
      </div>
      <DeleteElButton
        onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))}
      />
    </div>
  );
}

function RangeSliderEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "range_slider") return null;
  const { setData } = useQuiz();
  const patch = (p: Partial<Extract<SubEl, { kind: "range_slider" }>>) =>
    setData((prev) => updateSubEl(prev, stepId, el.id, p));
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Range slider</span>
      <label className="block text-xs text-gray-500 mt-2">Variable</label>
      <input
        className={inputBase}
        value={el.variable}
        placeholder="score"
        onChange={(e) => patch({ variable: e.target.value })}
      />
      <label className="block text-xs text-gray-500 mt-2">Unit (optional)</label>
      <input
        className={inputBase}
        value={el.unit ?? ""}
        placeholder="%, kg, hours..."
        onChange={(e) => patch({ unit: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <label className="block text-xs text-gray-500">Min</label>
          <input type="number" className={inputBase} value={el.min}
            onChange={(e) => patch({ min: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Max</label>
          <input type="number" className={inputBase} value={el.max}
            onChange={(e) => patch({ max: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Step</label>
          <input type="number" className={inputBase} value={el.step ?? 1}
            onChange={(e) => patch({ step: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Initial</label>
          <input type="number" className={inputBase} value={el.initial ?? Math.round((el.min + el.max) / 2)}
            onChange={(e) => patch({ initial: Number(e.target.value) })} />
        </div>
      </div>
      <DeleteElButton onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))} />
    </div>
  );
}

function TextInputEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "text_input") return null;
  const { setData } = useQuiz();
  const patch = (p: Partial<Extract<SubEl, { kind: "text_input" }>>) =>
    setData((prev) => updateSubEl(prev, stepId, el.id, p));
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Text input</span>
      <label className="block text-xs text-gray-500 mt-2">Variable</label>
      <input
        className={inputBase}
        value={el.variable}
        placeholder="petName"
        onChange={(e) => patch({ variable: e.target.value })}
      />
      <label className="block text-xs text-gray-500 mt-2">Input type</label>
      <div className="flex gap-2 mt-1">
        {(["text", "number", "date"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => patch({ inputType: t })}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              (el.inputType ?? "text") === t
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="block text-xs text-gray-500 mt-2">Placeholder</label>
      <input
        className={inputBase}
        value={el.placeholder ?? ""}
        placeholder="Type your answer..."
        onChange={(e) => patch({ placeholder: e.target.value })}
      />
      {el.inputType === "number" && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-xs text-gray-500">Min</label>
            <input type="number" className={inputBase} value={el.min ?? ""}
              onChange={(e) => patch({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Max</label>
            <input type="number" className={inputBase} value={el.max ?? ""}
              onChange={(e) => patch({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
        </div>
      )}
      <DeleteElButton onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher: picks the right editor per kind
// ---------------------------------------------------------------------------

function SubElEditor({ el, stepId }: EditorProps) {
  switch (el.kind) {
    case "title":       return <TitleEditor el={el} stepId={stepId} />;
    case "text":        return <TextEditor el={el} stepId={stepId} />;
    case "image":       return <ImageEditor el={el} stepId={stepId} />;
    case "question":    return <QuestionEditor el={el} stepId={stepId} />;
    case "custom_html": return <CustomHtmlEditor el={el} stepId={stepId} />;
    case "loading":     return <LoadingEditor el={el} stepId={stepId} />;
    case "range_slider": return <RangeSliderEditor el={el} stepId={stepId} />;
    case "text_input": return <TextInputEditor el={el} stepId={stepId} />;
  }
}

// ---------------------------------------------------------------------------
// StepEditor — main panel rendered in the right column
// ---------------------------------------------------------------------------

export function StepEditor() {
  const { selectedNodeId, data } = useQuiz();

  if (!selectedNodeId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Select a step to edit</p>
      </div>
    );
  }

  const node = data.nodes[selectedNodeId];

  if (!node) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Node not found</p>
      </div>
    );
  }

  if (node.kind === "start") {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Start node - no content to edit</p>
      </div>
    );
  }

  if (node.kind === "exit") {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Exit node - configure redirect in settings</p>
      </div>
    );
  }

  // node.kind === "step"
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Step name header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 truncate">{node.name}</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {node.subEls.length} element{node.subEls.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Scrollable subEl editors */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {node.subEls.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">
            No elements yet. Add one from the palette below.
          </p>
        ) : (
          node.subEls.map((el) => (
            <SubElEditor key={el.id} el={el} stepId={selectedNodeId} />
          ))
        )}
      </div>

      {/* Element palette pinned at bottom */}
      <div className="shrink-0">
        <ElementPalette />
      </div>
    </div>
  );
}
