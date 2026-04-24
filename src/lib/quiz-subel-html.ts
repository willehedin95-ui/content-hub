// src/lib/quiz-subel-html.ts
// Round-trip serializer: SubEl[] <-> HTML string using data-quiz-el marker attributes.
// Previews use plain-text extraction - no raw HTML injection in React trees.

import type { SubEl, QuestionOption, QuizData } from "@/types/quiz";

// ---------------------------------------------------------------------------
// Serializer: SubEl[] -> HTML string
// ---------------------------------------------------------------------------

export function subElsToHtml(subEls: SubEl[]): string {
  return subEls.map(subElToHtml).join("\n");
}

function subElToHtml(el: SubEl): string {
  switch (el.kind) {
    case "title":
      return `<h1 data-quiz-el="title" data-quiz-el-id="${el.id}">${el.text}</h1>`;

    case "text":
      return `<div data-quiz-el="text" data-quiz-el-id="${el.id}">${el.text}</div>`;

    case "image":
      return `<img data-quiz-el="image" data-quiz-el-id="${el.id}" src="${el.url}" alt="${escapeAttr(el.alt)}" />`;

    case "question": {
      const optionsJson = JSON.stringify(el.options).replace(/'/g, "&#39;");
      const buttons = el.options
        .map((o) => `<button data-quiz-opt-id="${o.id}">${escapeHtml(o.label)}</button>`)
        .join("");
      return (
        `<div data-quiz-el="question" data-quiz-el-id="${el.id}"` +
        ` data-quiz-kindof="${el.kindOf}" data-quiz-layout="${el.layout}"` +
        ` data-quiz-options='${optionsJson}'>${buttons}</div>`
      );
    }

    case "custom_html":
      return `<div data-quiz-el="custom_html" data-quiz-el-id="${el.id}">${el.html}</div>`;

    case "loading":
      return (
        `<div data-quiz-el="loading" data-quiz-el-id="${el.id}"` +
        ` data-quiz-seconds="${el.seconds}" data-quiz-style="${escapeAttr(el.style)}">${escapeHtml(el.text)}</div>`
      );

    case "text_input":
      return (
        `<div data-quiz-el="text_input" data-quiz-el-id="${el.id}"` +
        ` data-quiz-variable="${escapeAttr(el.variable)}"` +
        ` data-quiz-input-type="${el.inputType ?? "text"}"` +
        (el.placeholder ? ` data-quiz-placeholder="${escapeAttr(el.placeholder)}"` : "") +
        `></div>`
      );

    case "range_slider":
      return (
        `<div data-quiz-el="range_slider" data-quiz-el-id="${el.id}"` +
        ` data-quiz-variable="${escapeAttr(el.variable)}"` +
        ` data-quiz-min="${el.min}" data-quiz-max="${el.max}"` +
        (el.step != null ? ` data-quiz-step="${el.step}"` : "") +
        (el.initial != null ? ` data-quiz-initial="${el.initial}"` : "") +
        (el.unit ? ` data-quiz-unit="${escapeAttr(el.unit)}"` : "") +
        `></div>`
      );

    case "testimonial_slider": {
      const itemsJson = JSON.stringify(el.items).replace(/'/g, "&#39;");
      return (
        `<div data-quiz-el="testimonial_slider" data-quiz-el-id="${el.id}"` +
        ` data-quiz-items='${itemsJson}'></div>`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Parser: HTML string -> SubEl[]
// ---------------------------------------------------------------------------

export function htmlToSubEls(html: string): SubEl[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  // The parsed HTML is inside body > div (our wrapper)
  const wrapper = doc.body.firstElementChild;
  if (!wrapper) return [];

  const result: SubEl[] = [];
  for (const child of Array.from(wrapper.children)) {
    const el = child as HTMLElement;
    const kind = el.getAttribute("data-quiz-el");
    const id = el.getAttribute("data-quiz-el-id") ?? generateFallbackId();

    if (!kind) {
      // Fallback: wrap as custom_html
      result.push({ id, kind: "custom_html", html: el.outerHTML });
      continue;
    }

    switch (kind) {
      case "title":
        result.push({
          id,
          kind: "title",
          text: el.innerHTML,
          isRichText: true,
          contentFormat: "html",
        });
        break;

      case "text":
        result.push({
          id,
          kind: "text",
          text: el.innerHTML,
          isRichText: true,
          contentFormat: "html",
        });
        break;

      case "image": {
        const imgEl = el as HTMLImageElement;
        result.push({
          id,
          kind: "image",
          url: imgEl.getAttribute("src") ?? "",
          alt: imgEl.getAttribute("alt") ?? "",
        });
        break;
      }

      case "question": {
        const kindOf = (el.getAttribute("data-quiz-kindof") ?? "single") as "single" | "multi";
        const layout = (el.getAttribute("data-quiz-layout") ?? "list") as
          | "list"
          | "cards"
          | "image_cards";
        const optionsRaw = el.getAttribute("data-quiz-options") ?? "[]";
        // Reverse the single-quote escape applied during serialization
        const optionsJson = optionsRaw.replace(/&#39;/g, "'");
        const options = JSON.parse(optionsJson) as QuestionOption[];
        result.push({ id, kind: "question", kindOf, layout, options });
        break;
      }

      case "custom_html":
        result.push({ id, kind: "custom_html", html: el.innerHTML });
        break;

      case "loading": {
        const secondsStr = el.getAttribute("data-quiz-seconds") ?? "3";
        const style = el.getAttribute("data-quiz-style") ?? "";
        const text = el.textContent ?? "";
        result.push({
          id,
          kind: "loading",
          text,
          style,
          seconds: Number(secondsStr),
        });
        break;
      }

      default:
        // Unknown marker kind - treat as custom_html fallback
        result.push({ id, kind: "custom_html", html: el.outerHTML });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: replace a step's subEls in a QuizData (immutable)
// ---------------------------------------------------------------------------

/**
 * Returns a new QuizData with the given step's subEls replaced.
 * No-op if the step doesn't exist or is not a step node.
 */
export function updateStepSubEls(q: QuizData, stepId: string, subEls: SubEl[]): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let _fallbackCounter = 0;
function generateFallbackId(): string {
  return `fallback_${Date.now()}_${_fallbackCounter++}`;
}
