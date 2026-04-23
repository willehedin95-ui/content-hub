"use client";
import { useQuiz } from "./QuizContext";
import { ElementPalette } from "./ElementPalette";
import { updateSubEl, removeSubEl, addOption, updateOption, removeOption } from "@/lib/quiz-graph";
import type { SubEl } from "@/types/quiz";
import { Trash2, PlusCircle, X } from "lucide-react";

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
