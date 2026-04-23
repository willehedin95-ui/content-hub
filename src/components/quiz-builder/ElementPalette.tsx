"use client";
import { Type, AlignLeft, HelpCircle, Image, Code, Loader } from "lucide-react";
import { useQuiz } from "./QuizContext";
import { addSubEl } from "@/lib/quiz-graph";

type PaletteItem = {
  kind: "title" | "text" | "question" | "image" | "custom_html" | "loading";
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const PALETTE_ITEMS: PaletteItem[] = [
  { kind: "title", label: "Title", Icon: Type },
  { kind: "text", label: "Text", Icon: AlignLeft },
  { kind: "question", label: "Question", Icon: HelpCircle },
  { kind: "image", label: "Image", Icon: Image },
  { kind: "custom_html", label: "Custom HTML", Icon: Code },
  { kind: "loading", label: "Loading", Icon: Loader },
];

export function ElementPalette() {
  const { selectedNodeId, data, setData } = useQuiz();

  // Only show when a step is selected
  if (!selectedNodeId) return null;
  const node = data.nodes[selectedNodeId];
  if (!node || node.kind !== "step") return null;

  function handleAdd(kind: PaletteItem["kind"]) {
    if (!selectedNodeId) return;
    setData((prev) => addSubEl(prev, selectedNodeId!, { kind }));
  }

  return (
    <div className="border-t border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Add element</p>
      <div className="grid grid-cols-3 gap-1.5">
        {PALETTE_ITEMS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            onClick={() => handleAdd(kind)}
            className="flex flex-col items-center gap-1 p-2 rounded-md border border-gray-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-gray-600 hover:text-indigo-700 transition-colors text-xs"
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
