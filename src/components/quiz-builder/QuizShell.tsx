"use client";
import { QuizTopBar } from "./QuizTopBar";

export function QuizShell() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <QuizTopBar />
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 text-sm text-gray-500">Steps tree (task 4.3)</div>
        </aside>
        <main className="flex-1 overflow-hidden bg-gray-100">
          <div className="h-full flex items-center justify-center text-gray-400">Canvas (task 4.1)</div>
        </main>
        <aside className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 text-sm text-gray-500">Step editor (chunk 5)</div>
        </aside>
      </div>
    </div>
  );
}
