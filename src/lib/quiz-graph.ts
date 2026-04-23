// src/lib/quiz-graph.ts
export function newId(prefix: "step" | "edge" | "exit" | "start" | "el" | "opt" | "vg"): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}_${rand}`;
}
