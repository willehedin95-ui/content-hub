"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  label: string;
  complete: boolean;
}

interface ConceptStepperProps {
  steps: StepDef[];
  currentStep: number;
  onStepClick: (step: number) => void;
}

export default function ConceptStepper({ steps, currentStep, onStepClick }: ConceptStepperProps) {
  return (
    <div className="flex items-center justify-center py-4">
      {steps.map((step, i) => {
        const isCurrent = i === currentStep;
        const isDone = step.complete;

        return (
          <div key={i} className="flex items-center">
            {/* Connector line (before each step except the first) */}
            {i > 0 && (
              <div
                className={cn(
                  "w-16 h-0.5 mx-1",
                  steps[i - 1].complete ? "bg-green-500" : "bg-gray-200"
                )}
              />
            )}

            {/* Step circle + label */}
            <button
              onClick={() => onStepClick(i)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  isDone
                    ? "bg-green-500 text-white"
                    : isCurrent
                    ? "bg-indigo-600 text-white"
                    : "border-2 border-gray-300 text-gray-400 group-hover:border-gray-400"
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap transition-colors",
                  isDone
                    ? "text-green-600 font-medium"
                    : isCurrent
                    ? "text-indigo-600 font-medium"
                    : "text-gray-400 group-hover:text-gray-500"
                )}
              >
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
