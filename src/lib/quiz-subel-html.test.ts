import { describe, it, expect } from "vitest";
import { subElsToHtml, htmlToSubEls } from "./quiz-subel-html";
import type { SubEl } from "@/types/quiz";

function roundTrip(els: SubEl[]): SubEl[] {
  return htmlToSubEls(subElsToHtml(els));
}

describe("subElsToHtml / htmlToSubEls round-trip", () => {
  it("round-trips a title element", () => {
    const el: SubEl = {
      id: "el_title_1",
      kind: "title",
      text: "<strong>Hello</strong> world",
      isRichText: true,
      contentFormat: "html",
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips a text element", () => {
    const el: SubEl = {
      id: "el_text_1",
      kind: "text",
      text: "<em>Some</em> body copy",
      isRichText: true,
      contentFormat: "html",
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips an image element", () => {
    const el: SubEl = {
      id: "el_img_1",
      kind: "image",
      url: "https://example.com/pic.jpg",
      alt: "A nice image",
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips a question element (single, list, with 2 options)", () => {
    const el: SubEl = {
      id: "el_q_1",
      kind: "question",
      kindOf: "single",
      layout: "list",
      options: [
        { id: "opt_a", label: "Option A" },
        { id: "opt_b", label: "Option B" },
      ],
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips a question element with optional emoji/imageUrl/value fields", () => {
    const el: SubEl = {
      id: "el_q_2",
      kind: "question",
      kindOf: "multi",
      layout: "cards",
      options: [
        { id: "opt_1", label: "Yes", emoji: "✅", imageUrl: "https://img.co/1.png", value: "yes" },
        { id: "opt_2", label: "No", emoji: "❌" },
      ],
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips a custom_html element", () => {
    const el: SubEl = {
      id: "el_ch_1",
      kind: "custom_html",
      html: "<script>alert('test')</script>",
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips a loading element", () => {
    const el: SubEl = {
      id: "el_load_1",
      kind: "loading",
      text: "Analyzing your answers...",
      style: "dots",
      seconds: 3,
    };
    expect(roundTrip([el])).toEqual([el]);
  });

  it("round-trips multiple elements in order", () => {
    const els: SubEl[] = [
      { id: "e1", kind: "title", text: "Welcome", isRichText: true, contentFormat: "html" },
      { id: "e2", kind: "text", text: "Tell us about yourself.", isRichText: true, contentFormat: "html" },
      {
        id: "e3",
        kind: "question",
        kindOf: "single",
        layout: "list",
        options: [
          { id: "o1", label: "Option A" },
          { id: "o2", label: "Option B" },
        ],
      },
      { id: "e4", kind: "image", url: "https://cdn.example.com/img.webp", alt: "Banner" },
      { id: "e5", kind: "custom_html", html: "<span>divider</span>" },
      { id: "e6", kind: "loading", text: "Loading...", style: "spinner", seconds: 5 },
    ];
    expect(roundTrip(els)).toEqual(els);
  });

  it("falls back to custom_html for unrecognized top-level elements", () => {
    const plainHtml = "<p>Unrecognized paragraph</p>";
    const result = htmlToSubEls(plainHtml);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("custom_html");
    if (result[0].kind === "custom_html") {
      expect(result[0].html).toBe(plainHtml);
    }
  });

  it("question element: single quotes in option labels survive round-trip", () => {
    const el: SubEl = {
      id: "el_q_sq",
      kind: "question",
      kindOf: "single",
      layout: "list",
      options: [{ id: "opt_sq", label: "It's great" }],
    };
    expect(roundTrip([el])).toEqual([el]);
  });
});
