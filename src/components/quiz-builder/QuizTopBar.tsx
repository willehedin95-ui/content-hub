"use client";
import Link from "next/link";
import { ArrowLeft, Check, AlertCircle } from "lucide-react";
import { useQuiz } from "./QuizContext";

export function QuizTopBar() {
  const { quiz, saveState, setName } = useQuiz();
  return (
    <div className="h-14 border-b border-gray-200 bg-white px-4 flex items-center gap-4">
      <Link href="/quizzes" className="p-1.5 hover:bg-gray-100 rounded" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <input
        value={quiz.name}
        onChange={(e) => setName(e.target.value)}
        className="font-medium text-lg bg-transparent border-0 outline-0 focus:bg-gray-50 rounded px-2 py-1"
      />
      <div className="flex-1" />
      {saveState === "saving" || saveState === "dirty" ? (
        <span className="text-xs text-gray-500">Saving...</span>
      ) : saveState === "saved" ? (
        <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Saved</span>
      ) : saveState === "error" ? (
        <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Error</span>
      ) : null}
    </div>
  );
}
