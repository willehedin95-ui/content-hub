import { describe, it, expect } from "vitest";
import { buildDefaultQuiz, buildDefaultSettings } from "./quiz-defaults";

describe("buildDefaultQuiz", () => {
  it("returns a quiz with start, step, and exit nodes", () => {
    const q = buildDefaultQuiz();
    const nodes = Object.values(q.nodes);
    expect(nodes.some((n) => n.kind === "start")).toBe(true);
    expect(nodes.some((n) => n.kind === "step")).toBe(true);
    expect(nodes.some((n) => n.kind === "exit")).toBe(true);
    expect(nodes).toHaveLength(3);
  });

  it("returns a quiz with two edges", () => {
    const q = buildDefaultQuiz();
    const edges = Object.values(q.edges);
    expect(edges).toHaveLength(2);
  });

  it("edges connect start->step->exit in order", () => {
    const q = buildDefaultQuiz();
    const startId = Object.values(q.nodes).find((n) => n.kind === "start")!.id;
    const stepId = Object.values(q.nodes).find((n) => n.kind === "step")!.id;
    const exitId = Object.values(q.nodes).find((n) => n.kind === "exit")!.id;
    const edges = Object.values(q.edges);
    expect(edges.some((e) => e.from === startId && e.to === stepId)).toBe(true);
    expect(edges.some((e) => e.from === stepId && e.to === exitId)).toBe(true);
  });

  it("has a camera with z=1", () => {
    const q = buildDefaultQuiz();
    expect(q.camera.z).toBe(1);
  });
});

describe("buildDefaultSettings", () => {
  it("returns settings with progressBar true", () => {
    const s = buildDefaultSettings();
    expect(s.progressBar).toBe(true);
  });

  it("returns settings with all required brandColors", () => {
    const s = buildDefaultSettings();
    expect(s.brandColors.background).toBeDefined();
    expect(s.brandColors.textPrimary).toBeDefined();
    expect(s.brandColors.primaryBrand).toBeDefined();
  });

  it("returns settings with backNavigation true", () => {
    const s = buildDefaultSettings();
    expect(s.backNavigation).toBe(true);
  });
});
