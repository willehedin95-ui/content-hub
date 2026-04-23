// Topological ordering of step nodes for progress tracking
import type { QuizData, StepNode } from "./types";

export function topoOrderSteps(data: QuizData): StepNode[] {
  const steps = Object.values(data.nodes).filter(
    (n): n is StepNode => n.kind === "step",
  );
  const stepIds = new Set(steps.map((s) => s.id));
  const start = Object.values(data.nodes).find((n) => n.kind === "start");
  const queue: string[] = [];

  if (start) {
    for (const e of Object.values(data.edges)) {
      if (e.from === start.id && stepIds.has(e.to)) queue.push(e.to);
    }
  } else {
    for (const s of steps) queue.push(s.id);
  }

  const visited = new Set<string>();
  const order: StepNode[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = data.nodes[id];
    if (node && node.kind === "step") order.push(node);
    for (const e of Object.values(data.edges)) {
      if (e.from === id && stepIds.has(e.to) && !visited.has(e.to)) {
        queue.push(e.to);
      }
    }
  }

  // Include any unreachable steps
  for (const s of steps) if (!visited.has(s.id)) order.push(s);
  return order;
}
