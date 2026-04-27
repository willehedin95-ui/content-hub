"use client";
import { useQuiz } from "./QuizContext";
import { topoOrderSteps } from "@/lib/quiz-graph";
import type { StepNode } from "@/types/quiz";

type Props = {
  readOnly?: boolean;
  collapsed?: boolean;
};

export function StepsTree({ readOnly = false, collapsed = false }: Props) {
  const { data, selectedNodeId, setSelectedNodeId } = useQuiz();
  const steps = topoOrderSteps(data);

  if (steps.length === 0) {
    if (collapsed) {
      return (
        <aside className="w-[60px] border-r border-gray-200 bg-white shrink-0 overflow-y-auto py-2 flex flex-col items-center" />
      );
    }
    return (
      <aside className="w-64 border-r border-gray-200 bg-white shrink-0 overflow-y-auto">
        <div className="p-4 text-sm text-gray-400 italic">No steps yet</div>
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside className="w-[60px] border-r border-gray-200 bg-white shrink-0 overflow-y-auto py-2 flex flex-col items-center gap-1.5">
        {steps.map((step, index) => {
          const isSelected = selectedNodeId === step.id;
          return (
            <CollapsedStepDot
              key={step.id}
              step={step}
              index={index}
              selected={isSelected}
              onClick={() => !readOnly && setSelectedNodeId(step.id)}
            />
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r border-gray-200 bg-white shrink-0 overflow-y-auto">
      <ol className="p-2 space-y-1">
        {steps.map((step, index) => {
          const isSelected = selectedNodeId === step.id;
          return (
            <FullStepRow
              key={step.id}
              step={step}
              index={index}
              selected={isSelected}
              onClick={() => !readOnly && setSelectedNodeId(step.id)}
            />
          );
        })}
      </ol>
    </aside>
  );
}

function FullStepRow({
  step,
  index,
  selected,
  onClick,
}: {
  step: StepNode;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
          selected
            ? "bg-indigo-50 text-indigo-900 font-medium"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span
          className={`text-xs font-mono shrink-0 w-5 text-center ${
            selected ? "text-indigo-500" : "text-gray-400"
          }`}
        >
          {index + 1}
        </span>
        <span className="flex-1 truncate">{step.name}</span>
        {step.variantGroupId && (
          <span className="px-1.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded shrink-0">
            A/B
          </span>
        )}
      </button>
    </li>
  );
}

function CollapsedStepDot({
  step,
  index,
  selected,
  onClick,
}: {
  step: StepNode;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const titleSuffix = step.variantGroupId ? " (A/B)" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${index + 1}. ${step.name}${titleSuffix}`}
      className={`relative w-8 h-8 rounded-full text-xs font-medium border transition-colors flex items-center justify-center shrink-0 ${
        selected
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
      }`}
    >
      {index + 1}
      {step.variantGroupId && (
        <span
          className={`absolute -top-1 -right-1 w-3 h-3 rounded-full text-[8px] font-bold flex items-center justify-center ${
            selected
              ? "bg-white text-indigo-600 border border-indigo-600"
              : "bg-indigo-100 text-indigo-700 border border-indigo-200"
          }`}
          aria-label="A/B variant"
        >
          A
        </span>
      )}
    </button>
  );
}
