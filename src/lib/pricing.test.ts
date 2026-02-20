import { describe, it, expect } from "vitest";
import {
  calcOpenAICost,
  GPT4O_INPUT_COST,
  GPT4O_OUTPUT_COST,
  KIE_IMAGE_COST,
} from "./pricing";

describe("calcOpenAICost", () => {
  it("returns 0 for zero tokens", () => {
    expect(calcOpenAICost(0, 0)).toBe(0);
  });

  it("calculates input-only cost correctly", () => {
    // 1M input tokens at $2.50/1M = $2.50
    expect(calcOpenAICost(1_000_000, 0)).toBeCloseTo(GPT4O_INPUT_COST);
  });

  it("calculates output-only cost correctly", () => {
    // 1M output tokens at $10.00/1M = $10.00
    expect(calcOpenAICost(0, 1_000_000)).toBeCloseTo(GPT4O_OUTPUT_COST);
  });

  it("calculates combined cost for typical translation", () => {
    // ~2000 input, ~1500 output (typical translation call)
    const cost = calcOpenAICost(2000, 1500);
    const expected = (2000 * GPT4O_INPUT_COST + 1500 * GPT4O_OUTPUT_COST) / 1_000_000;
    expect(cost).toBeCloseTo(expected);
  });

  it("handles large token counts without overflow", () => {
    const cost = calcOpenAICost(10_000_000, 5_000_000);
    expect(cost).toBeCloseTo(10 * GPT4O_INPUT_COST + 5 * GPT4O_OUTPUT_COST);
  });
});

describe("pricing constants", () => {
  it("GPT-4.1 input cost is $2.00 per 1M tokens", () => {
    expect(GPT4O_INPUT_COST).toBe(2.0);
  });

  it("GPT-4.1 output cost is $8.00 per 1M tokens", () => {
    expect(GPT4O_OUTPUT_COST).toBe(8.0);
  });

  it("Kie.ai image cost is $0.09 per image", () => {
    expect(KIE_IMAGE_COST).toBe(0.09);
  });
});
