"use client";
import { QuizProvider } from "@/components/quiz-builder/QuizContext";
import { QuizShell } from "@/components/quiz-builder/QuizShell";
import type { QuizRow } from "@/types/quiz";

export function QuizEditorClient({ initialQuiz }: { initialQuiz: QuizRow }) {
  return (
    <QuizProvider initialQuiz={initialQuiz}>
      <QuizShell />
    </QuizProvider>
  );
}
