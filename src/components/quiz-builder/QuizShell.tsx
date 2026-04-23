"use client";
import { QuizTopBar } from "./QuizTopBar";
import { LogicCanvas } from "./LogicCanvas";
import { StepsTree } from "./StepsTree";
import { StepEditor } from "./StepEditor";

export function QuizShell() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <QuizTopBar />
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
          <StepsTree />
        </aside>
        <main className="flex-1 overflow-hidden bg-gray-100 relative">
          <LogicCanvas />
        </main>
        <aside className="w-96 border-l border-gray-200 bg-white flex flex-col min-h-0">
          <StepEditor />
        </aside>
      </div>
    </div>
  );
}
