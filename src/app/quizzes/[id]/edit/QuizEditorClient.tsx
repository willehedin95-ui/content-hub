"use client";
import { QuizProvider } from "@/components/quiz-builder/QuizContext";
import { QuizAnalyticsProvider } from "@/components/quiz-builder/QuizAnalyticsContext";
import { QuizShell } from "@/components/quiz-builder/QuizShell";
import type { QuizRow } from "@/types/quiz";

export function QuizEditorClient({ initialQuiz }: { initialQuiz: QuizRow }) {
  return (
    <QuizProvider initialQuiz={initialQuiz}>
      <QuizAnalyticsProvider quizId={initialQuiz.id}>
        <QuizShell />
      </QuizAnalyticsProvider>
    </QuizProvider>
  );
}
