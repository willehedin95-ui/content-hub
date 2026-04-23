"use client";
import { useQuiz } from "./QuizContext";
import { topoOrderSteps } from "@/lib/quiz-graph";

export function StepsTree() {
  const { data, selectedNodeId, setSelectedNodeId } = useQuiz();
  const steps = topoOrderSteps(data);

  if (steps.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-400 italic">No steps yet</div>
    );
  }

  return (
    <ol className="p-2 space-y-1">
      {steps.map((step, index) => {
        const isSelected = selectedNodeId === step.id;
        return (
          <li key={step.id}>
            <button
              onClick={() => setSelectedNodeId(step.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-indigo-50 text-indigo-900 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span
                className={`text-xs font-mono shrink-0 w-5 text-center ${
                  isSelected ? "text-indigo-500" : "text-gray-400"
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
      })}
    </ol>
  );
}
