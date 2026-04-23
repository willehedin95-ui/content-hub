// src/lib/quiz-defaults.ts
import type { QuizData, QuizSettings } from "@/types/quiz";
import { newId } from "./quiz-graph";

export function buildDefaultQuiz(): QuizData {
  const startId = newId("start");
  const stepId = newId("step");
  const exitId = newId("exit");
  const e1 = newId("edge");
  const e2 = newId("edge");
  return {
    id: `quiz_${Date.now().toString(36)}`,
    nodes: {
      [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
      [stepId]: {
        id: stepId,
        kind: "step",
        name: "First Question",
        size: { width: 280, height: 360 },
        position: { x: 300, y: 100 },
        rotation: 0,
        subEls: [],
      },
      [exitId]: {
        id: exitId,
        kind: "exit",
        name: "Exit",
        size: { width: 180, height: 80 },
        position: { x: 700, y: 200 },
        redirectUrl: "",
      },
    },
    edges: {
      [e1]: { id: e1, from: startId, to: stepId, condition: { kind: "default" } },
      [e2]: { id: e2, from: stepId, to: exitId, condition: { kind: "default" } },
    },
    camera: { x: 0, y: 0, z: 1 },
  };
}

export function buildDefaultSettings(): QuizSettings {
  return {
    brandColors: {
      background: "#FFFFFF",
      textPrimary: "#1A1A1A",
      textSecondary: "#6B7280",
      primaryBrand: "#2563EB",
      optionBackground: "#F9FAFB",
    },
    fontSettings: { enabled: false, fontFamily: "Inter" },
    progressBar: true,
    stepProgressCount: false,
    backNavigation: true,
    metadata: { title: "Quiz", description: "" },
    providers: {},
    redirectUrl: "",
  };
}
