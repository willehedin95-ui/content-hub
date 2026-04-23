"use client";
import { useQuiz } from "./QuizContext";
import { ElementPalette } from "./ElementPalette";
import type { SubEl } from "@/types/quiz";

// Strip HTML tags to produce a plain-text preview string.
// Used so we never inject raw HTML into the React tree.
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function SubElPreview({ el }: { el: SubEl }) {
  switch (el.kind) {
    case "title":
      return (
        <div className="mb-3 p-2 border border-gray-100 rounded-md bg-gray-50">
          <h3 className="text-base font-semibold text-gray-800">{stripTags(el.text)}</h3>
          <span className="text-xs text-gray-400">title</span>
        </div>
      );

    case "text":
      return (
        <div className="mb-3 p-2 border border-gray-100 rounded-md bg-gray-50">
          <p className="text-sm text-gray-700">{stripTags(el.text)}</p>
          <span className="text-xs text-gray-400">text</span>
        </div>
      );

    case "image":
      return (
        <div className="mb-3 p-2 border border-gray-100 rounded-md bg-gray-50">
          {el.url ? (
            <img
              src={el.url}
              alt={el.alt}
              className="max-h-32 rounded object-contain"
            />
          ) : (
            <div className="h-16 flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-300 rounded">
              No image URL set
            </div>
          )}
          <span className="text-xs text-gray-400">image</span>
        </div>
      );

    case "question":
      return (
        <div className="mb-3 p-2 border border-gray-100 rounded-md bg-gray-50">
          <div className="flex flex-col gap-1 mb-1">
            {el.options.map((opt) => (
              <button
                key={opt.id}
                className="text-sm text-left px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-700 cursor-default"
                tabIndex={-1}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            question ({el.kindOf}, {el.layout})
          </span>
        </div>
      );

    case "custom_html":
      return (
        <div className="mb-3 p-2 border border-dashed border-gray-300 rounded-md bg-gray-100">
          <p className="text-xs font-mono text-gray-500">&lt;custom HTML&gt;</p>
          <p className="text-xs text-gray-400 mt-0.5">id: {el.id}</p>
        </div>
      );

    case "loading":
      return (
        <div className="mb-3 p-2 border border-dashed border-gray-300 rounded-md bg-gray-100">
          <p className="text-xs text-gray-600">
            Loading for {el.seconds}s: {el.text}
          </p>
          <span className="text-xs text-gray-400">loading</span>
        </div>
      );
  }
}

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
        <p className="text-xs text-gray-400 mt-0.5">{node.subEls.length} element{node.subEls.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Scrollable subEl list */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {node.subEls.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">
            No elements yet. Add one from the palette below.
          </p>
        ) : (
          node.subEls.map((el) => <SubElPreview key={el.id} el={el} />)
        )}
      </div>

      {/* Element palette pinned at bottom */}
      <div className="shrink-0">
        <ElementPalette />
      </div>
    </div>
  );
}
