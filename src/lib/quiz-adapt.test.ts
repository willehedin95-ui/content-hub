// src/lib/quiz-adapt.test.ts
// Unit tests for the quiz adaptation layer.
// No Claude API calls — Anthropic SDK is mocked throughout.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAdaptSystemPrompt, buildAdaptUserMessage, parseAdaptResponse } from "./quiz-adapt";
import type { QuizData, QuizSettings } from "@/types/quiz";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk so no real API calls happen in unit tests
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '{"data":{},"settings":{},"changes":[],"warnings":[]}' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock supabase-admin so loadProductContext can be imported without crashing
// ---------------------------------------------------------------------------

vi.mock("./supabase-admin", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: "mocked" } }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        order: () => ({
          ascending: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PRODUCT: ProductFull = {
  id: "prod-123",
  slug: "hydro13",
  name: "Hydro13",
  tagline: "Beauty Collagen Drinkable",
  description: "Marine collagen supplement for skin health",
  benefits: ["Reduces wrinkles", "Improves skin elasticity", "Supports joint health"],
  usps: ["30ml daily dose", "Marine-sourced collagen", "Clinically tested"],
  claims: ["Studies show 28% reduction in wrinkles after 8 weeks"],
  certifications: ["GMP certified"],
  ingredients: "Marine collagen peptides, vitamin C, hyaluronic acid",
  price_info: { se: "499 SEK / month" },
  target_audience: "Women 35-60 interested in skincare and anti-aging",
  competitor_keywords: ["vital proteins", "correxiko", "bulletproof collagen"],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const SAMPLE_GUIDELINE: CopywritingGuideline = {
  id: "guide-1",
  product_id: "prod-123",
  name: "Brand Voice",
  content: "Be empathetic and science-backed. Avoid hype. Speak like a knowledgeable friend.",
  sort_order: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const SAMPLE_REFERENCE: ReferencePage = {
  id: "ref-1",
  product_id: "prod-123",
  name: "Example landing page",
  url: null,
  content: "Hydro13 transformed my skin in just 8 weeks. No more fine lines.",
  notes: "High-converting testimonial",
  created_at: "2024-01-01T00:00:00Z",
};

const SAMPLE_QUIZ_DATA: QuizData = {
  id: "quiz_abc123",
  nodes: {
    start_1: { id: "start_1", kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
    step_1: {
      id: "step_1",
      kind: "step",
      name: "Age Group",
      size: { width: 280, height: 360 },
      position: { x: 300, y: 200 },
      rotation: 0,
      subEls: [
        { id: "el_1", kind: "title", text: "<p>What is your age?</p>", isRichText: true, contentFormat: "html" },
        {
          id: "el_2",
          kind: "question",
          kindOf: "single",
          layout: "list",
          options: [
            { id: "opt_1", label: "18-25" },
            { id: "opt_2", label: "26-35" },
            { id: "opt_3", label: "36+" },
          ],
        },
      ],
    },
    exit_1: {
      id: "exit_1",
      kind: "exit",
      name: "Exit",
      size: { width: 180, height: 80 },
      position: { x: 700, y: 200 },
      redirectUrl: "https://competitor.com/shop",
    },
  },
  edges: {
    edge_1: { id: "edge_1", from: "start_1", to: "step_1", condition: { kind: "default" } },
    edge_2: { id: "edge_2", from: "step_1", to: "exit_1", condition: { kind: "default" } },
  },
  camera: { x: 0, y: 0, z: 1 },
};

const SAMPLE_SETTINGS: QuizSettings = {
  brandColors: {
    background: "#ffffff",
    textPrimary: "#111111",
    textSecondary: "#666666",
    primaryBrand: "#5c6bc0",
    optionBackground: "#f5f5f5",
  },
  fontSettings: { enabled: false, fontFamily: "Inter" },
  progressBar: true,
  stepProgressCount: false,
  backNavigation: true,
  metadata: { title: "Skin Quiz", description: "Find your perfect skincare routine" },
  providers: {},
  redirectUrl: "",
};

// ---------------------------------------------------------------------------
// Tests: buildAdaptSystemPrompt
// ---------------------------------------------------------------------------

describe("buildAdaptSystemPrompt", () => {
  it("includes CORE_KNOWLEDGE in the system prompt", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    // CORE_KNOWLEDGE includes the adaptation guide header
    expect(prompt).toContain("Adaptation Guide");
    // Also includes foundation or principles content
    expect(prompt).toContain("Self-Generated Persuasion");
  });

  it("includes product name, USPs, and target audience", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("Hydro13");
    expect(prompt).toContain("30ml daily dose");
    expect(prompt).toContain("Women 35-60");
  });

  it("includes brand voice guidelines when provided", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [SAMPLE_GUIDELINE],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("Brand Voice");
    expect(prompt).toContain("empathetic and science-backed");
  });

  it("includes reference pages when provided", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [SAMPLE_REFERENCE],
      targetMarket: "se",
    });
    expect(prompt).toContain("Example landing page");
    expect(prompt).toContain("No more fine lines");
  });

  it("includes Swedish localization rules for market=se", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("Swedish (Rikssvenska)");
    expect(prompt).toContain("'du' form");
    expect(prompt).toContain("hype-y superlatives");
  });

  it("includes Danish localization rules for market=dk", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "dk",
    });
    expect(prompt).toContain("Danish");
    expect(prompt).toContain("'du' form");
  });

  it("includes Norwegian localization rules for market=no", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "no",
    });
    expect(prompt).toContain("Norwegian Bokmål");
    expect(prompt).toContain("'du' form");
  });

  it("includes user notes when provided", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
      userNotes: "Focus on the anti-aging angle and mention our 90-day guarantee",
    });
    expect(prompt).toContain("Focus on the anti-aging angle");
    expect(prompt).toContain("90-day guarantee");
  });

  it("does not include user notes section when userNotes is undefined", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).not.toContain("ADDITIONAL INSTRUCTIONS FROM THE USER");
  });

  it("includes output format instructions with correct market label", () => {
    const promptSe = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(promptSe).toContain("Swedish (sv)");

    const promptDk = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "dk",
    });
    expect(promptDk).toContain("Danish (da)");

    const promptNo = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "no",
    });
    expect(promptNo).toContain("Norwegian Bokmål (no)");
  });

  it("specifies that image subEls should be preserved", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain('kind="image"');
  });

  it("specifies that ExitNode redirectUrl should be set to empty string", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("redirectUrl");
    expect(prompt).toContain('""');
  });

  it("caps reference pages at 3 even when more are provided", () => {
    const refs: ReferencePage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ref-${i}`,
      product_id: "prod-123",
      name: `Reference ${i}`,
      url: null,
      content: `Content for reference ${i}`,
      notes: null,
      created_at: "2024-01-01T00:00:00Z",
    }));

    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: refs,
      targetMarket: "se",
    });

    // Should include refs 0, 1, 2 but not 3 or 4
    expect(prompt).toContain("Reference 0");
    expect(prompt).toContain("Reference 1");
    expect(prompt).toContain("Reference 2");
    expect(prompt).not.toContain("Reference 3");
    expect(prompt).not.toContain("Reference 4");
  });
});

// ---------------------------------------------------------------------------
// Tests: buildAdaptUserMessage
// ---------------------------------------------------------------------------

describe("buildAdaptUserMessage", () => {
  it("includes the quiz data as JSON", () => {
    const message = buildAdaptUserMessage(SAMPLE_QUIZ_DATA, SAMPLE_SETTINGS);
    expect(message).toContain('"quiz_abc123"');
    expect(message).toContain('"step_1"');
    expect(message).toContain("What is your age?");
  });

  it("includes the settings as JSON", () => {
    const message = buildAdaptUserMessage(SAMPLE_QUIZ_DATA, SAMPLE_SETTINGS);
    expect(message).toContain('"Skin Quiz"');
  });

  it("contains the core instruction keywords", () => {
    const message = buildAdaptUserMessage(SAMPLE_QUIZ_DATA, SAMPLE_SETTINGS);
    expect(message).toContain("Preserve ALL structural keys");
    expect(message).toContain("image subEls");
    expect(message).toContain("redirectUrl");
  });
});

// ---------------------------------------------------------------------------
// Tests: parseAdaptResponse
// ---------------------------------------------------------------------------

describe("parseAdaptResponse", () => {
  const validResponse = JSON.stringify({
    data: {
      id: "quiz_abc123",
      nodes: {
        start_1: { id: "start_1", kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
        step_1: {
          id: "step_1",
          kind: "step",
          name: "Åldersgrupp",
          size: { width: 280, height: 360 },
          position: { x: 300, y: 200 },
          rotation: 0,
          subEls: [
            { id: "el_1", kind: "title", text: "<p>Vilken åldersgrupp tillhör du?</p>", isRichText: true, contentFormat: "html" },
          ],
        },
        exit_1: {
          id: "exit_1",
          kind: "exit",
          name: "Exit",
          size: { width: 180, height: 80 },
          position: { x: 700, y: 200 },
          redirectUrl: "",
        },
      },
      edges: {
        edge_1: { id: "edge_1", from: "start_1", to: "step_1", condition: { kind: "default" } },
      },
      camera: { x: 0, y: 0, z: 1 },
    },
    settings: {
      brandColors: {
        background: "#ffffff",
        textPrimary: "#111111",
        textSecondary: "#666666",
        primaryBrand: "#5c6bc0",
        optionBackground: "#f5f5f5",
      },
      fontSettings: { enabled: false, fontFamily: "Inter" },
      progressBar: true,
      stepProgressCount: false,
      backNavigation: true,
      metadata: { title: "Hudquiz", description: "Hitta din perfekta hudvårdsrutin" },
      providers: {},
      redirectUrl: "",
    },
    changes: [
      { stepId: "step_1", field: "subEls[0].text", before: "<p>What is your age?</p>", after: "<p>Vilken åldersgrupp tillhör du?</p>" },
    ],
    warnings: ["Step exit_1 redirectUrl set to empty string"],
  });

  it("parses a valid JSON response correctly", () => {
    const result = parseAdaptResponse(validResponse);
    expect(result.data.nodes).toBeDefined();
    expect(result.settings.metadata.title).toBe("Hudquiz");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].stepId).toBe("step_1");
    expect(result.warnings).toHaveLength(1);
  });

  it("strips markdown code fences if present", () => {
    const withFence = "```json\n" + validResponse + "\n```";
    const result = parseAdaptResponse(withFence);
    expect(result.data.nodes).toBeDefined();
  });

  it("strips plain code fences if present", () => {
    const withFence = "```\n" + validResponse + "\n```";
    const result = parseAdaptResponse(withFence);
    expect(result.data.nodes).toBeDefined();
  });

  it("throws a clear error for malformed JSON", () => {
    expect(() => parseAdaptResponse("{ not valid json")).toThrow("Failed to parse Claude response as JSON");
  });

  it("throws if data field is missing", () => {
    const noData = JSON.stringify({ settings: {}, changes: [], warnings: [] });
    expect(() => parseAdaptResponse(noData)).toThrow("missing 'data'");
  });

  it("throws if settings field is missing", () => {
    const noSettings = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: {}, id: "x" },
      changes: [],
      warnings: [],
    });
    expect(() => parseAdaptResponse(noSettings)).toThrow("missing 'settings'");
  });

  it("throws if changes is not an array", () => {
    const noChanges = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: {}, id: "x" },
      settings: {},
      changes: "not-array",
      warnings: [],
    });
    expect(() => parseAdaptResponse(noChanges)).toThrow("missing 'changes' array");
  });

  it("throws if warnings is not an array", () => {
    const noWarnings = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: {}, id: "x" },
      settings: {},
      changes: [],
      warnings: "not-array",
    });
    expect(() => parseAdaptResponse(noWarnings)).toThrow("missing 'warnings' array");
  });

  it("throws if data.nodes is missing", () => {
    const noNodes = JSON.stringify({
      data: { edges: {}, camera: {}, id: "x" },
      settings: {},
      changes: [],
      warnings: [],
    });
    expect(() => parseAdaptResponse(noNodes)).toThrow("data.nodes");
  });

  it("throws if a change entry is missing stepId", () => {
    const badChange = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: {}, id: "x" },
      settings: {},
      changes: [{ field: "text", before: "a", after: "b" }],
      warnings: [],
    });
    expect(() => parseAdaptResponse(badChange)).toThrow("'stepId'");
  });

  it("throws if a change entry is missing field", () => {
    const badChange = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: {}, id: "x" },
      settings: {},
      changes: [{ stepId: "step_1", before: "a", after: "b" }],
      warnings: [],
    });
    expect(() => parseAdaptResponse(badChange)).toThrow("'field'");
  });

  it("returns empty changes and warnings arrays", () => {
    const minimal = JSON.stringify({
      data: { nodes: {}, edges: {}, camera: { x: 0, y: 0, z: 1 }, id: "x" },
      settings: { brandColors: {}, fontSettings: {}, progressBar: false, stepProgressCount: false, backNavigation: false, metadata: { title: "", description: "" }, providers: {}, redirectUrl: "" },
      changes: [],
      warnings: [],
    });
    const result = parseAdaptResponse(minimal);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: system prompt does not leak user notes when empty string
// ---------------------------------------------------------------------------

describe("buildAdaptSystemPrompt edge cases", () => {
  it("does not include user notes section for empty string", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
      userNotes: "",
    });
    expect(prompt).not.toContain("ADDITIONAL INSTRUCTIONS FROM THE USER");
  });

  it("does not include user notes section for whitespace-only string", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
      userNotes: "   ",
    });
    expect(prompt).not.toContain("ADDITIONAL INSTRUCTIONS FROM THE USER");
  });

  it("includes ingredients in the product context", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("Marine collagen peptides");
    expect(prompt).toContain("vitamin C");
  });

  it("includes clinical claims", () => {
    const prompt = buildAdaptSystemPrompt({
      product: SAMPLE_PRODUCT,
      guidelines: [],
      references: [],
      targetMarket: "se",
    });
    expect(prompt).toContain("28% reduction in wrinkles");
  });
});
