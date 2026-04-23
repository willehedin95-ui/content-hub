"use client";
import { QuizTopBar } from "./QuizTopBar";
import { LogicCanvas } from "./LogicCanvas";
import { StepsTree } from "./StepsTree";

export function QuizShell() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <QuizTopBar />
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
          <StepsTree />
        </aside>
        <main className="flex-1 overflow-hidden bg-gray-100">
          <LogicCanvas />
        </main>
        <aside className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 text-sm text-gray-500">Step editor (chunk 5)</div>
        </aside>
      </div>
    </div>
  );
}
