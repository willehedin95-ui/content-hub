/** @jsxImportSource preact */
// SubEl renderers. Content comes exclusively from the authenticated editor
// (not user input) so innerHTML is intentional and safe here per the spec.
// If user-generated content is ever added, sanitize first.

import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SubEl, QuestionOption, QuizSettings, StepNode } from "./types";
import { t } from "./i18n";

// ---------------------------------------------------------------------------
// HTML sanitizer — strips inline styles/classes injected by rich text editors
// Do NOT call on CustomHtmlEl (its formatting is intentional)
// ---------------------------------------------------------------------------

// Keep color accents from imported rich-text but remove size/spacing/background
// overrides that would fight our theme. Classes always dropped from CHILDREN
// (our outer wrapper's class is preserved so CSS theming works).
function stripStylesAndClasses(root: HTMLElement | null): void {
  if (!root) return;
  const walk = (el: Element) => {
    el.removeAttribute("class");
    const style = el.getAttribute("style");
    if (style) {
      const kept = style
        .split(";")
        .map((d) => d.trim())
        .filter((d) => /^color\s*:/i.test(d))
        .join("; ");
      if (kept) el.setAttribute("style", kept);
      else el.removeAttribute("style");
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  // Walk children only so the outer wrapper's theme class survives.
  for (const child of Array.from(root.children)) walk(child);
}

// ---------------------------------------------------------------------------
// Variable interpolation: {varName} in editor-controlled strings gets replaced
// with the matching value from the runtime's variables map. Escapes HTML on
// the injected value so a weird imported answer can't break attribute context.
// Unknown vars are left as-is so authors can spot missing captures.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compute the Swedish possessive form of a name. If the name ends in s, x or z
 * we don't append another s ("Jens" → "Jens", not "Jenss"). Otherwise we add
 * "s" for the standard genitive form ("Bella" → "Bellas"). This mirrors the
 * informal Swedish convention favoured by content authors.
 */
function swedishPossessive(name: string): string {
  if (!name) return name;
  const last = name.slice(-1).toLowerCase();
  if (last === "s" || last === "x" || last === "z") return name;
  return name + "s";
}

// Per-variable fallback when the captured value is empty/whitespace. Without
// fallbacks the offer page reads "träningsplan är klar" instead of "Din valps
// träningsplan är klar" if the user skipped the name input. We map well-known
// pet variables to graceful defaults.
const VARIABLE_FALLBACKS: Record<string, string> = {
  name: "Din valp",
  breed: "din valp",
  primary_pain: "beteendeproblem",
  primary_pain_value: "beteendet",
  problem_duration: "ett tag",
  upcoming_event_value: "",
  time_per_day: "10 min/dag",
};

function pickValue(name: string, raw: string | undefined): string | undefined {
  if (raw != null && raw.trim() !== "") return raw;
  if (name in VARIABLE_FALLBACKS) return VARIABLE_FALLBACKS[name];
  return undefined;
}

export function interpolate(
  text: string,
  variables: Record<string, string> | undefined,
): string {
  if (!text.includes("{")) return text;
  return text.replace(/\{([a-zA-Z_][\w]*)\}/g, (m, name) => {
    // Derived possessive: `{name_pos}` resolves to the Swedish genitive of
    // `{name}` ("Bella" → "Bellas", "Jens" → "Jens"). Falls back to "Din
    // valps" when name is empty so all "{name_pos} träningsplan" copy still
    // reads naturally.
    if (name.endsWith("_pos")) {
      const base = name.slice(0, -"_pos".length);
      const raw = variables?.[base];
      const v = pickValue(base, raw);
      if (v == null) return m;
      if (v === "Din valp") return escapeHtml("Din valps");
      return escapeHtml(swedishPossessive(v));
    }
    const raw = variables?.[name];
    const v = pickValue(name, raw);
    if (v == null) return m;
    return escapeHtml(v);
  });
}

// ---------------------------------------------------------------------------
// Individual SubEl renderers
// ---------------------------------------------------------------------------

function TitleEl({
  el,
  variables,
}: {
  el: Extract<SubEl, { kind: "title" }>;
  variables?: Record<string, string>;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const rendered = interpolate(el.text, variables);
  useEffect(() => {
    // Safe: content is editor-controlled rich text (not user input); any
    // injected variable value is HTML-escaped by interpolate().
    if (ref.current) {
      ref.current.innerHTML = rendered; // nosec
      stripStylesAndClasses(ref.current);
    }
  }, [rendered]);
  return (
    <h1
      ref={ref}
      data-quiz-el="title"
      data-quiz-el-id={el.id}
      class="quiz-title"
    />
  );
}

function TextEl({
  el,
  variables,
}: {
  el: Extract<SubEl, { kind: "text" }>;
  variables?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = interpolate(el.text, variables);
  useEffect(() => {
    // Safe: content is editor-controlled rich text (not user input); any
    // injected variable value is HTML-escaped by interpolate().
    if (ref.current) {
      ref.current.innerHTML = rendered; // nosec
      stripStylesAndClasses(ref.current);
    }
  }, [rendered]);
  return (
    <div
      ref={ref}
      data-quiz-el="text"
      data-quiz-el-id={el.id}
      class="quiz-text"
    />
  );
}

function ImageEl({ el }: { el: Extract<SubEl, { kind: "image" }> }) {
  return (
    <img
      data-quiz-el="image"
      data-quiz-el-id={el.id}
      src={el.url}
      alt={el.alt}
      class="quiz-image"
    />
  );
}

function TextInputEl({
  el,
  variables,
  onVariableChange,
}: {
  el: Extract<SubEl, { kind: "text_input" }>;
  variables?: Record<string, string>;
  onVariableChange?: (variable: string, value: string) => void;
}) {
  const [value, setValue] = useState(variables?.[el.variable] ?? "");
  useEffect(() => {
    onVariableChange?.(el.variable, value);
  }, [value, el.variable, onVariableChange]);
  const inputType =
    el.inputType === "number" ? "number" : el.inputType === "date" ? "date" : "text";
  return (
    <input
      type={inputType}
      class="quiz-text-input"
      data-quiz-el="text_input"
      data-quiz-el-id={el.id}
      placeholder={el.placeholder}
      value={value}
      min={el.min}
      max={el.max}
      onInput={(e) => setValue((e.target as HTMLInputElement).value)}
    />
  );
}

function RangeSliderEl({
  el,
  variables,
  onVariableChange,
}: {
  el: Extract<SubEl, { kind: "range_slider" }>;
  variables?: Record<string, string>;
  onVariableChange?: (variable: string, value: string) => void;
}) {
  const [value, setValue] = useState<number>(
    Number(variables?.[el.variable] ?? el.initial ?? Math.round((el.min + el.max) / 2)),
  );
  useEffect(() => {
    onVariableChange?.(el.variable, String(value));
  }, [value, el.variable, onVariableChange]);
  const unit = el.unit ?? "";
  const pct = ((value - el.min) / (el.max - el.min)) * 100;
  return (
    <div
      class="quiz-range"
      data-quiz-el="range_slider"
      data-quiz-el-id={el.id}
    >
      <div class="quiz-range-value">
        {value}
        {unit && ` ${unit}`}
      </div>
      <input
        type="range"
        class="quiz-range-input"
        min={el.min}
        max={el.max}
        step={el.step ?? 1}
        value={value}
        style={`--quiz-range-pct: ${pct}%`}
        onInput={(e) => setValue(Number((e.target as HTMLInputElement).value))}
      />
      <div class="quiz-range-bounds">
        <span>{el.min}{unit && ` ${unit}`}</span>
        <span>{el.max}{unit && ` ${unit}`}</span>
      </div>
    </div>
  );
}

function TestimonialSliderEl({
  el,
}: {
  el: Extract<SubEl, { kind: "testimonial_slider" }>;
}) {
  const [index, setIndex] = useState(0);
  const n = el.items.length;
  if (n === 0) return null;
  const item = el.items[index];
  const next = () => setIndex((i) => (i + 1) % n);
  const prev = () => setIndex((i) => (i - 1 + n) % n);
  return (
    <div
      class="quiz-testimonial-slider"
      data-quiz-el="testimonial_slider"
      data-quiz-el-id={el.id}
    >
      <div class="quiz-testimonial-card">
        {item.avatar && (
          <img src={item.avatar} alt={item.name} class="quiz-testimonial-avatar" />
        )}
        <div class="quiz-testimonial-body">
          <div class="quiz-testimonial-name">{item.name}</div>
          {typeof item.rating === "number" && (
            <div class="quiz-testimonial-rating" aria-label={`${item.rating} stars`}>
              {"★".repeat(Math.round(item.rating))}
              <span class="quiz-testimonial-rating-empty">
                {"★".repeat(Math.max(0, 5 - Math.round(item.rating)))}
              </span>
            </div>
          )}
          <div class="quiz-testimonial-text">{item.text}</div>
        </div>
      </div>
      {n > 1 && (
        <div class="quiz-testimonial-nav">
          <button type="button" class="quiz-testimonial-prev" onClick={prev} aria-label="Previous">
            &larr;
          </button>
          <span class="quiz-testimonial-dots">
            {Array.from({ length: n }, (_, i) => (
              <button
                key={i}
                type="button"
                class={`quiz-testimonial-dot${i === index ? " quiz-testimonial-dot--active" : ""}`}
                onClick={() => setIndex(i)}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </span>
          <button type="button" class="quiz-testimonial-next" onClick={next} aria-label="Next">
            &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Detect if a custom_html block is "rich" (uses its own CSS/SVG/fonts) vs.
 * a simple paragraph-only snippet we can safely inline.
 *
 * Rich blocks get rendered in a sandboxed iframe so their brand typography,
 * CSS variables, SVG graphics, and keyframe animations survive intact.
 *
 * Simple blocks (plain HTML fragments from Heyflow photo-carousel remnants
 * etc.) are still inlined and get the defensive sanitizer so they don't
 * fight our theme.
 */
/**
 * Wrap rich custom_html content in a minimal HTML document that picks up the
 * parent quiz's font + brand colours. Without the wrapper the iframe srcdoc
 * is parsed as a bare fragment and the browser uses its default UA stylesheet
 * (which is serif on most platforms) - that clashed with the rest of the
 * quiz that renders in Quicksand. We read CSS variables off the parent root
 * and re-declare them inside the iframe so author CSS can keep using them.
 */
function wrapCustomHtmlForIframe(authorHtml: string): string {
  // Discover parent quiz's CSS variables so we can mirror them into the iframe.
  // Falls back to the same defaults injected by injectStyles() so the wrapper
  // still works in unit tests / SSR environments.
  let cssVars = "";
  let fontFamily = "'Quicksand', system-ui, -apple-system, sans-serif";
  let textColor = "#1A1A1A";
  let bgColor = "transparent";
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) => {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    fontFamily = get("--quiz-font", fontFamily);
    textColor = get("--quiz-text-primary", textColor);
    bgColor = get("--quiz-bg", bgColor);
    const varNames = [
      "--quiz-bg",
      "--quiz-text-primary",
      "--quiz-text-secondary",
      "--quiz-brand",
      "--quiz-option-bg",
      "--quiz-option-border",
      "--quiz-option-selected-bg",
      "--quiz-option-radius",
      "--quiz-option-padding",
      "--quiz-option-border-width",
      "--quiz-cta-radius",
      "--quiz-cta-padding",
      "--quiz-step-gap",
      "--quiz-font",
    ];
    cssVars = varNames
      .map((n) => `  ${n}: ${get(n, "").trim() || "initial"};`)
      .join("\n");
  }

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap">
<style>
:root {
${cssVars}
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: ${fontFamily};
  color: ${textColor};
  background: ${bgColor};
  -webkit-font-smoothing: antialiased;
}
body { padding: 0; margin: 0; }
</style>
</head>
<body>${authorHtml}</body>
</html>`;
}

function isRichHtmlBlock(html: string): boolean {
  if (!html) return false;
  if (html.length > 1500) return true;
  if (/<style[\s>]/i.test(html)) return true;
  if (/<svg[\s>]/i.test(html)) return true;
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) return true;
  // Imports Google Fonts or any stylesheet
  if (/<link[^>]+rel=["']stylesheet/i.test(html)) return true;
  return false;
}

/** Sanitizer used for non-rich inlined blocks. */
function sanitizeCustomHtml(root: HTMLDivElement): void {
  const stripSelectors = [
    "svg",
    '[data-blocktype="photo-carousel"]',
    "input",
    "script",
    "style",
  ];
  for (const sel of stripSelectors) {
    for (const el of Array.from(root.querySelectorAll(sel))) {
      el.parentNode?.removeChild(el);
    }
  }
  if (root.innerText.trim().length === 0) {
    root.style.display = "none";
  }
}

function CustomHtmlEl({
  el,
  variables,
}: {
  el: Extract<SubEl, { kind: "custom_html" }>;
  variables?: Record<string, string>;
}) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resolved = interpolate(el.html, variables);
  const rich = isRichHtmlBlock(resolved);

  // Inline path (simple blocks)
  useEffect(() => {
    if (rich || !inlineRef.current) return;
    inlineRef.current.innerHTML = resolved; // nosec
    sanitizeCustomHtml(inlineRef.current);
  }, [resolved, rich]);

  // Rich path: auto-size iframe to content height. Iframe is same-origin
  // via srcdoc so we can read scrollHeight directly.
  // Tar max av documentElement + body scrollHeight + boundingClientRect
  // för att fånga både margins och post-load image growth (William 2026-05-03).
  useEffect(() => {
    if (!rich || !iframeRef.current) return;
    const iframe = iframeRef.current;
    let observer: ResizeObserver | null = null;
    let raf = 0;
    const imgListeners: Array<{ img: HTMLImageElement; handler: () => void }> = [];
    const updateHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const html = doc.documentElement;
        const body = doc.body;
        const h = Math.max(
          html?.scrollHeight ?? 0,
          html?.offsetHeight ?? 0,
          body?.scrollHeight ?? 0,
          body?.offsetHeight ?? 0,
        );
        if (h > 0) iframe.style.height = h + "px";
      } catch {
        /* sandbox or not-yet-ready */
      }
    };
    const onLoad = () => {
      updateHeight();
      raf = requestAnimationFrame(updateHeight);
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(updateHeight);
          observer.observe(doc.documentElement);
          if (doc.body) observer.observe(doc.body);
        }
        // Re-measure när varje img inuti iframen laddat klart.
        // ResizeObserver fångar inte alltid img-load-reflows tidigt nog.
        for (const img of Array.from(doc.images)) {
          if (img.complete) continue;
          const handler = () => updateHeight();
          img.addEventListener("load", handler);
          img.addEventListener("error", handler);
          imgListeners.push({ img, handler });
        }
      } catch {
        /* ignore */
      }
    };
    iframe.addEventListener("load", onLoad);
    // Also run once in case the iframe already loaded before this effect ran.
    onLoad();
    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
      for (const { img, handler } of imgListeners) {
        img.removeEventListener("load", handler);
        img.removeEventListener("error", handler);
      }
      if (raf) cancelAnimationFrame(raf);
    };
  }, [resolved, rich]);

  if (rich) {
    // Wrap author HTML in a minimal document that inherits the parent quiz's
    // font + design tokens. Without this the iframe falls back to the user
    // agent default (often a serif on iOS/Safari) which clashes with the
    // rest of the quiz UI. We read CSS variables off the parent root and
    // mirror them into the iframe so author CSS can use them too.
    const wrappedSrcdoc = wrapCustomHtmlForIframe(resolved);
    return (
      <iframe
        ref={iframeRef}
        data-quiz-el="custom_html"
        data-quiz-el-id={el.id}
        class="quiz-custom-html-frame"
        // Allow scripts (for author animations) and same-origin (so the
        // parent can auto-resize the iframe based on content height).
        // The HTML is author-controlled and trusted; we're not rendering
        // arbitrary third-party submissions.
        sandbox="allow-scripts allow-same-origin"
        srcdoc={wrappedSrcdoc}
        // scrolling="no" + CSS overflow:hidden förhindrar nested scroll om
        // height-mätningen är minimal undershoot. Page scrollar normalt
        // outside iframe (William 2026-05-03).
        scrolling="no"
        title={`Custom block ${el.id}`}
      />
    );
  }
  return (
    <div
      ref={inlineRef}
      data-quiz-el="custom_html"
      data-quiz-el-id={el.id}
      class="quiz-custom-html"
    />
  );
}

function LoadingEl({
  el,
  onComplete,
  variables,
}: {
  el: Extract<SubEl, { kind: "loading" }>;
  onComplete: () => void;
  variables?: Record<string, string>;
}) {
  useEffect(() => {
    const t = setTimeout(onComplete, el.seconds * 1000);
    return () => clearTimeout(t);
  }, [el.seconds, onComplete]);

  // Loading text supports {var} interpolation but is rendered as plain text -
  // authors should keep it short, no inline HTML. Variable values are still
  // HTML-escaped by interpolate(), so they're safe even if rendered as text.
  const rendered = interpolate(el.text ?? "", variables);

  return (
    <div
      data-quiz-el="loading"
      data-quiz-el-id={el.id}
      class="quiz-loading"
    >
      <div class="quiz-loading-spinner" />
      {rendered && <p class="quiz-loading-text">{rendered}</p>}
    </div>
  );
}

function OptionButton({
  option,
  layout,
  selected,
  onClick,
  variables,
  kindOf,
}: {
  option: QuestionOption;
  layout: "list" | "cards" | "image_cards" | "chips" | "dropdown";
  selected: boolean;
  onClick: () => void;
  variables?: Record<string, string>;
  kindOf?: "single" | "multi";
}) {
  const cls = [
    "quiz-option",
    `quiz-option--${layout}`,
    kindOf === "multi" ? "quiz-option--multi" : "",
    selected ? "quiz-option--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = interpolate(option.label, variables);
  // raising.dog pattern: multi-select shows a square checkbox left, single-
  // select on list/cards shows a right-arrow chevron. Both indicators are
  // hidden for image_cards (the photo IS the indicator) and chips (compact).
  const showCheckbox = kindOf === "multi" && (layout === "list" || layout === "cards" || layout === "image_cards");
  const showArrow = kindOf === "single" && (layout === "list" || layout === "cards" || layout === "image_cards");
  return (
    <button
      class={cls}
      data-quiz-opt-id={option.id}
      data-quiz-opt-value={option.value}
      onClick={onClick}
      type="button"
    >
      {layout === "image_cards" && option.imageUrl && (
        <img src={option.imageUrl} alt={label} class="quiz-option-img" />
      )}
      {layout === "image_cards" && !option.imageUrl && option.imageDescription && (
        <span class="quiz-option-img-placeholder" title={option.imageDescription}>
          <span class="quiz-option-img-placeholder-label">{option.imageDescription}</span>
        </span>
      )}
      {layout === "image_cards" ? (
        <span class="quiz-option-row">
          {option.emoji && <span class="quiz-option-emoji">{option.emoji}</span>}
          <span class="quiz-option-label">{label}</span>
        </span>
      ) : (
        <>
          {option.emoji && <span class="quiz-option-emoji">{option.emoji}</span>}
          <span class="quiz-option-label">{label}</span>
        </>
      )}
      {showArrow && (
        <span class="quiz-option-arrow" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 5L13 10L7 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      )}
      {showCheckbox && (
        <span class={`quiz-option-checkbox${selected ? " quiz-option-checkbox--checked" : ""}`} aria-hidden="true">
          {selected && (
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 10.5L8 14.5L16 6.5" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          )}
        </span>
      )}
    </button>
  );
}

function QuestionEl({
  el,
  onAnswer,
  market,
  variables,
}: {
  el: Extract<SubEl, { kind: "question" }>;
  onAnswer: (questionElId: string, optionId: string) => void;
  market: string | undefined;
  variables?: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleClick = (optId: string) => {
    if (el.kindOf === "single") {
      setSelected(new Set([optId]));
      // Auto-advance only for the visual layouts where a click IS the answer
      // (cards, list, image_cards, chips). Dropdown is a search/typing UX
      // where a misclick should not jump the user forward - they pick, then
      // confirm with Continue.
      if (el.layout !== "dropdown") {
        setTimeout(() => onAnswer(el.id, optId), 200);
      }
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(optId)) next.delete(optId);
        else next.add(optId);
        return next;
      });
    }
  };

  // Dropdown layout uses a dedicated component — keep clickable-card paths
  // as-is for list/cards/image_cards. Parent still owns the selected set
  // so the Continue button for multi-select sits outside the dropdown.
  if (el.layout === "dropdown") {
    return (
      <div
        data-quiz-el="question"
        data-quiz-el-id={el.id}
        class={`quiz-question quiz-question--dropdown`}
      >
        <DropdownQuestion
          el={el}
          selected={selected}
          onPick={(optId) => handleClick(optId)}
          market={market}
        />
        {selected.size > 0 && (
          <button
            class="quiz-btn quiz-btn--primary quiz-question-continue"
            type="button"
            onClick={() => onAnswer(el.id, [...selected][0])}
          >
            {t("continue", market)}{el.kindOf === "multi" ? ` (${selected.size})` : ""}
          </button>
        )}
        {el.escapeOption && (
          <button
            class="quiz-escape-link"
            type="button"
            onClick={() => onAnswer(el.id, el.escapeOption!.optionId)}
          >
            {el.escapeOption.label}
          </button>
        )}
      </div>
    );
  }

  // Hide the escape option from the visible card grid - it's rendered as a
  // text-link under the CTA instead. (raising.dog / EveryDoggy pattern.)
  const visibleOptions = el.escapeOption
    ? el.options.filter((o) => o.id !== el.escapeOption!.optionId)
    : el.options;

  return (
    <div
      data-quiz-el="question"
      data-quiz-el-id={el.id}
      class={`quiz-question quiz-question--${el.layout}`}
    >
      {visibleOptions.map((opt) => (
        <OptionButton
          key={opt.id}
          option={opt}
          layout={el.layout}
          selected={selected.has(opt.id)}
          onClick={() => handleClick(opt.id)}
          variables={variables}
          kindOf={el.kindOf}
        />
      ))}
      {(el.kindOf === "multi" || (el.kindOf === "single" && el.escapeOption)) && (
        <div class="quiz-question-bottom">
          {el.kindOf === "multi" && (
            <button
              class="quiz-btn quiz-btn--primary quiz-question-continue"
              type="button"
              disabled={selected.size === 0}
              onClick={() => {
                if (selected.size === 0) return;
                const firstId = [...selected][0];
                onAnswer(el.id, firstId);
              }}
            >
              {t("continue", market)}
            </button>
          )}
          {el.escapeOption && (
            <button
              class="quiz-escape-link"
              type="button"
              onClick={() => onAnswer(el.id, el.escapeOption!.optionId)}
            >
              {el.escapeOption.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownQuestion({
  el,
  selected,
  onPick,
  market,
}: {
  el: Extract<SubEl, { kind: "question" }>;
  selected: Set<string>;
  onPick: (optId: string) => void;
  market: string | undefined;
}) {
  // Inline-typeable autocomplete (raising.dog pattern). The user types
  // directly into the always-visible input; suggestions render inline below.
  // No "trigger button + modal panel" pattern - that felt heavy-handed and
  // didn't match the rest of the quiz UI.
  const isMulti = el.kindOf === "multi";
  const pickedOptions = el.options.filter((o) => selected.has(o.id));
  const hasPicks = pickedOptions.length > 0;

  // For single-select we initialise the input with the picked label so the
  // user sees their choice as text after picking. They can edit to swap
  // breeds without re-opening anything.
  const initialQuery = !isMulti && hasPicks ? pickedOptions[0].label : "";
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  // For single-select: if the input matches the picked label exactly, show
  // no suggestions (they've made their choice). If they edit, show
  // suggestions again. For multi-select: always filter on the typed text.
  const exactPickedMatch =
    !isMulti &&
    hasPicks &&
    pickedOptions[0].label.toLowerCase() === q;
  const filtered = q
    ? el.options.filter((o) => o.label.toLowerCase().includes(q))
    : el.options;
  const showSuggestions = focused && !exactPickedMatch;

  const placeholder =
    el.dropdownPlaceholder ||
    (el.searchable ? t("searchPlaceholder", market) : t("selectPlaceholder", market));

  return (
    <div
      class={`quiz-dropdown${focused ? " quiz-dropdown--open" : ""}${isMulti ? " quiz-dropdown--multi" : ""}`}
      ref={rootRef}
    >
      {/* Multi-select shows the chip-row above the input so users see their
          picks while typing more. Single-select shows the picked label as
          input text. */}
      {isMulti && hasPicks && (
        <div class="quiz-dropdown-chips quiz-dropdown-chips--stack">
          {pickedOptions.slice(0, 4).map((o) => (
            <span key={o.id} class="quiz-dropdown-chip">{o.label}</span>
          ))}
          {pickedOptions.length > 4 && (
            <span class="quiz-dropdown-chip quiz-dropdown-chip--more">
              +{pickedOptions.length - 4}
            </span>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        class="quiz-dropdown-input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        autoCapitalize="words"
        spellcheck={false}
        onFocus={() => setFocused(true)}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setFocused(true);
        }}
      />
      {showSuggestions && (
        <ul class="quiz-dropdown-list">
          {filtered.length === 0 && (
            <li class="quiz-dropdown-empty">{t("noMatches", market)}</li>
          )}
          {filtered.slice(0, 50).map((opt) => {
            const isSel = selected.has(opt.id);
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  class={`quiz-dropdown-item${isSel ? " quiz-dropdown-item--selected" : ""}`}
                  data-quiz-opt-id={opt.id}
                  onMouseDown={(e) => {
                    // Prevent the input from blurring before we register the click.
                    e.preventDefault();
                  }}
                  onClick={() => {
                    onPick(opt.id);
                    if (!isMulti) {
                      setQuery(opt.label);
                      setFocused(false);
                      inputRef.current?.blur();
                    } else {
                      setQuery("");
                      inputRef.current?.focus();
                    }
                  }}
                >
                  {isMulti && (
                    <span class={`quiz-dropdown-check${isSel ? " quiz-dropdown-check--on" : ""}`} aria-hidden="true">
                      {isSel ? "✓" : ""}
                    </span>
                  )}
                  {opt.emoji && <span class="quiz-dropdown-emoji">{opt.emoji}</span>}
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email capture form
// ---------------------------------------------------------------------------

export function EmailCaptureForm({
  onSubmit,
  market,
}: {
  onSubmit: (email: string) => void;
  market: string | undefined;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError(t("invalidEmail", market));
      return;
    }
    setError("");
    onSubmit(email);
  };

  return (
    <form class="quiz-email-form" onSubmit={handleSubmit} novalidate>
      <input
        type="email"
        class="quiz-email-input"
        placeholder={t("emailPlaceholder", market)}
        value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        required
      />
      {error && <p class="quiz-email-error">{error}</p>}
      <button type="submit" class="quiz-btn quiz-btn--primary quiz-email-submit">
        {t("continue", market)}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Offer timer-bar (Profil + Offer step). Renderas mellan profile-card och
// offer-body sub-els i StepRenderer så position:sticky fungerar mot
// parent-page-scroll. Inuti iframen funkar sticky inte (iframen själv
// scrollar inte). 10-min countdown persisterad i sessionStorage.
// (William 2026-05-04)
// ---------------------------------------------------------------------------

export function OfferTimerBar() {
  const TOTAL_SECONDS = 10 * 60;
  const STORAGE_KEY = "quiz-offer-timer-end";
  const [remaining, setRemaining] = useState<number>(TOTAL_SECONDS);

  useEffect(() => {
    let endTs: number;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        endTs = parseInt(saved, 10);
      } else {
        endTs = Date.now() + TOTAL_SECONDS * 1000;
        sessionStorage.setItem(STORAGE_KEY, String(endTs));
      }
    } catch {
      endTs = Date.now() + TOTAL_SECONDS * 1000;
    }
    const tick = () => {
      const left = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div class="quiz-offer-timer">
      <span class="quiz-offer-timer-text">Personligt erbjudande löper ut</span>
      <span class="quiz-offer-timer-clock">{mm}:{ss}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step renderer
// ---------------------------------------------------------------------------

export function StepRenderer({
  node,
  onAnswer,
  onLoadingComplete,
  onEmailSubmit,
  captureAtStepId,
  market,
  onContinue,
  variables,
  onVariableChange,
}: {
  node: StepNode;
  onAnswer: (questionElId: string, optionId: string) => void;
  onLoadingComplete: () => void;
  onEmailSubmit: (email: string) => void;
  captureAtStepId: string | undefined;
  market: string | undefined;
  onContinue?: () => void;
  variables?: Record<string, string>;
  onVariableChange?: (variable: string, value: string) => void;
}) {
  const hasQuestion = node.subEls.some((el) => el.kind === "question");
  const hasLoading = node.subEls.some((el) => el.kind === "loading");
  // Commit-gate steps render their own Yes/No UI inside the custom_html
  // iframe (PawChamp modal-over-loading pattern). The runtime hides its own
  // Continue button so the user only sees the modal's buttons; the iframe
  // postMessages "quiz-runtime-continue" back to advance the flow.
  const isCommitGate = !!node.name && /^commit/i.test(node.name);
  const showContinueBtn =
    !hasQuestion && !hasLoading && !isCommitGate && typeof onContinue === "function";

  // Disable Continue when a required text_input is empty. Otherwise users can
  // skip the name step entirely and downstream {name}/{name_pos} interpolation
  // breaks (William reproduced this on v16 - "träningsplan är klar" missing
  // the "Bellas" prefix). We treat all text_input subEls as required.
  const textInputs = node.subEls.filter(
    (el): el is Extract<SubEl, { kind: "text_input" }> => el.kind === "text_input",
  );
  const continueDisabled =
    showContinueBtn &&
    textInputs.length > 0 &&
    textInputs.some((el) => {
      const v = variables?.[el.variable];
      return v == null || v.trim().length === 0;
    });

  return (
    <div class="quiz-step" data-step-id={node.id}>
      {node.subEls.map((el) => {
        switch (el.kind) {
          case "title":
            return <TitleEl key={el.id} el={el} variables={variables} />;
          case "text":
            return <TextEl key={el.id} el={el} variables={variables} />;
          case "image":
            return <ImageEl key={el.id} el={el} />;
          case "custom_html":
            return <CustomHtmlEl key={el.id} el={el} variables={variables} />;
          case "loading":
            return (
              <LoadingEl key={el.id} el={el} onComplete={onLoadingComplete} variables={variables} />
            );
          case "question":
            return (
              <QuestionEl key={el.id} el={el} onAnswer={onAnswer} market={market} variables={variables} />
            );
          case "text_input":
            return (
              <TextInputEl
                key={el.id}
                el={el}
                variables={variables}
                onVariableChange={onVariableChange}
              />
            );
          case "range_slider":
            return (
              <RangeSliderEl
                key={el.id}
                el={el}
                variables={variables}
                onVariableChange={onVariableChange}
              />
            );
          case "testimonial_slider":
            return <TestimonialSliderEl key={el.id} el={el} />;
        }
      })}
      {captureAtStepId === node.id && (
        <EmailCaptureForm onSubmit={onEmailSubmit} market={market} />
      )}
      {showContinueBtn && (
        <div class="quiz-continue-wrap" data-step-name={node.name ?? ""}>
          <button
            class="quiz-btn quiz-btn--primary"
            type="button"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {t("continue", market)}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div class="quiz-progress" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
      <div class="quiz-progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS vars injector from QuizSettings
// ---------------------------------------------------------------------------

export function injectStyles(settings: QuizSettings): void {
  const { brandColors, fontSettings } = settings;
  const fontFamily =
    fontSettings.enabled && fontSettings.fontFamily
      ? fontSettings.fontFamily
      : "Inter, system-ui, sans-serif";

  // Load Google Font if not Inter
  if (
    fontSettings.enabled &&
    fontSettings.fontFamily &&
    fontSettings.fontFamily !== "Inter"
  ) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      fontSettings.fontFamily,
    )}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }

  const design = settings.design ?? {};
  const style = document.createElement("style");
  style.textContent = `
:root {
  --quiz-bg: ${brandColors.background};
  --quiz-text-primary: ${brandColors.textPrimary};
  --quiz-text-secondary: ${brandColors.textSecondary};
  --quiz-brand: ${brandColors.primaryBrand};
  --quiz-option-bg: ${brandColors.optionBackground};
  --quiz-option-border: ${brandColors.optionBorder ?? "rgba(107, 114, 128, 0.3)"};
  --quiz-option-selected-bg: ${brandColors.optionSelectedBg ?? `color-mix(in srgb, ${brandColors.primaryBrand} 10%, transparent)`};
  --quiz-option-radius: ${design.optionRadius ?? "16px"};
  --quiz-option-padding: ${design.optionPadding ?? "16px"};
  --quiz-option-border-width: ${design.optionBorderWidth ?? "2px"};
  --quiz-cta-radius: ${design.ctaRadius ?? "12px"};
  --quiz-cta-padding: ${design.ctaPadding ?? "16px 40px"};
  --quiz-step-gap: ${design.stepGap ?? "20px"};
  --quiz-font: ${fontFamily};
  /* Fallbacks for imported quizzes that reference accent vars inline */
  --red: #d0011b;
  --green: #16a34a;
  --blue: #2563eb;
  --yellow: #eab308;
  --orange: #f97316;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: var(--quiz-font);
  background: var(--quiz-bg);
  color: var(--quiz-text-primary);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
#quiz-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.quiz-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  background: var(--quiz-bg);
}

.quiz-header {
  width: 100%;
  max-width: 720px;
  display: flex;
  align-items: center;
  padding: 14px 20px;
  gap: 12px;
}
/* Equal-flex side containers ensure logo sits in exact center regardless of
 * whether back-btn or step-count are present. Each side reserves the same
 * width so the middle column is mathematically centered. */
.quiz-header-side {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  min-width: 0;
}
.quiz-header-side--end { justify-content: flex-end; }
.quiz-logo { height: 24px; object-fit: contain; flex: 0 0 auto; }

.quiz-back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  color: var(--quiz-text-primary);
  background: rgba(0,0,0,0.04);
  border: none;
  cursor: pointer;
}
.quiz-back-btn:hover { background: rgba(0,0,0,0.08); }

.quiz-step-count {
  font-size: 13px;
  color: var(--quiz-text-secondary);
  margin-left: auto;
}

.quiz-progress {
  width: 100%;
  max-width: 720px;
  height: 4px;
  background: rgba(0,0,0,0.06);
  border-radius: 2px;
  overflow: hidden;
}

.quiz-progress-bar {
  height: 100%;
  background: var(--quiz-brand);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.quiz-content {
  width: 100%;
  max-width: 640px;
  padding: 24px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex: 1;
}

.quiz-step {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: quiz-step-in 0.28s ease-out both;
}
/* Opacity-only animation. Note: a non-none transform on .quiz-step would
 * create a containing block for descendants and break position fixed on the
 * .quiz-question-bottom CTA (per CSS spec). Slide-in was nice-to-have. */
@keyframes quiz-step-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .quiz-step { animation: none; }
}

.quiz-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--quiz-text-primary);
  text-align: center;
  margin-bottom: 4px;
}
.quiz-title h1, .quiz-title h2, .quiz-title h3,
.quiz-title h4, .quiz-title h5, .quiz-title h6 {
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  display: block;
  margin: 0;
  padding: 0;
}

.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
  text-align: center;
}
.quiz-text h1, .quiz-text h2, .quiz-text h3,
.quiz-text h4, .quiz-text h5, .quiz-text h6 {
  color: var(--quiz-text-primary);
  line-height: 1.35;
  letter-spacing: -0.01em;
}
.quiz-text h1, .quiz-text h2 { font-size: 22px; font-weight: 700; }
.quiz-text h3 { font-size: 20px; font-weight: 400; }
.quiz-text h4 { font-size: 18px; font-weight: 400; }
.quiz-text h5 { font-size: 16px; font-weight: 400; }
.quiz-text h6 { font-size: 14px; font-weight: 400; }
.quiz-text p { margin: 0; }
.quiz-text p + p { margin-top: 8px; }

.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 320px; }

.quiz-custom-html { font-size: 15px; line-height: 1.6; color: var(--quiz-text-secondary); }
.quiz-custom-html-frame {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  min-height: 120px;
  /* iframe height is set dynamically by the runtime after load.
   * overflow:hidden + scrolling=no på elementet förhindrar nested scroll
   * om height-mätningen är minimal undershoot (William 2026-05-03 - testimonial-
   * sliden visade dubbel scrollbar pga avatar-images laddades efter initial
   * scrollHeight-mätning). Page scrollar normalt outside iframe. */
  overflow: hidden;
}

/* När iframens commit-gate öppnar modal, expandera iframen till full
 * viewport så iframens egna lokala overlay täcker hela skärmen (inte bara
 * iframens normala area). Iframes är "windows" som content inuti inte kan
 * visuellt escape från - därför kan parent-backdrop aldrig hamna BAKOM
 * iframen och samtidigt ha modal-content från iframen ovanpå. Lösning:
 * gör iframen själv viewport-stor (William 2026-05-04).
 *
 * App.tsx togglar .modal-active på .quiz-shell baserat på postMessage
 * från iframen ('quiz-modal-open'/'quiz-modal-close'). */
.quiz-shell.modal-active .quiz-custom-html-frame {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 100;
  animation: quiz-modal-in 0.2s ease-out;
}
.quiz-shell.modal-active {
  /* Lås body-scroll när modal är aktiv så användaren inte kan rulla ifrån
   * fokuset och hitta gamla iframe-positionen. */
  overflow: hidden;
}
@keyframes quiz-modal-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Offer timer-bar för profil+offer-steget (b24). Renderas mellan profile-
 * card och offer-body sub-els i StepRenderer (inte i parent App.tsx) så
 * den hamnar visuellt EFTER profile-card och blir sticky när användaren
 * scrollar förbi - inte fixed-from-top. Edge-to-edge via 100vw + negative
 * margin för att bryta ut ur .quiz-content's horizontal padding. (William
 * 2026-05-04). */
.quiz-offer-timer {
  position: sticky;
  top: 0;
  z-index: 30;
  width: 100vw;
  margin-left: calc((100vw - 100%) / -2);
  margin-right: calc((100vw - 100%) / -2);
  margin-top: 24px;
  margin-bottom: 16px;
  background: linear-gradient(90deg, #FF7A45 0%, #FF9D6E 100%);
  color: #FFFFFF;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 6px 20px rgba(255, 122, 69, 0.25);
}
.quiz-offer-timer-text {
  font-size: 14px;
  font-weight: 700;
}
.quiz-offer-timer-clock {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: rgba(255, 255, 255, 0.18);
  padding: 4px 12px;
  border-radius: 8px;
}

.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
/* image_cards = Woofz-style grid med stor bild ovanför label. 2-kol när
 * få options, wrap vid fler. Bild dominerar visuellt - perfekt för
 * gender/age-segmentering där visuell distinktion mellan alternativ
 * gör scanningen snabbare. (William 2026-05-07) */
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
.quiz-question--chips { flex-direction: row; flex-wrap: wrap; gap: 8px; justify-content: flex-start; }

/* Base option: Clarflow-style soft-border card. All brand tokens from
 * settings.brandColors + settings.design so swiped quizzes match source. */
.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: var(--quiz-option-border-width) solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius);
  padding: var(--quiz-option-padding);
  min-height: 52px;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.3;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  width: 100%;
}
.quiz-option:hover { border-color: color-mix(in srgb, var(--quiz-brand) 40%, var(--quiz-option-border)); }
.quiz-option--selected {
  background: var(--quiz-option-selected-bg);
  border-color: var(--quiz-brand);
}
.quiz-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--quiz-bg), 0 0 0 4px var(--quiz-brand);
}

/* raising.dog inspired indicators */
.quiz-option-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1.5px solid var(--quiz-option-border);
  background: #FFFFFF;
  flex: 0 0 auto;
  margin-left: auto;
  transition: background 0.15s, border-color 0.15s;
}
.quiz-option-checkbox--checked {
  background: var(--quiz-brand);
  border-color: var(--quiz-brand);
}
.quiz-option-arrow {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  color: rgba(0, 0, 0, 0.35);
  flex: 0 0 auto;
}
.quiz-option--selected .quiz-option-arrow { color: var(--quiz-brand); }
.quiz-option--cards .quiz-option-arrow { display: none; }
.quiz-option--cards .quiz-option-checkbox { display: none; }

.quiz-option--cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: var(--quiz-option-padding);
}
.quiz-option--image_cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 10px 8px 8px;
  overflow: hidden;
  min-height: 0;
  align-items: center;
  gap: 6px;
}
.quiz-option--image_cards .quiz-option-label { padding: 0; font-size: 15px; font-weight: 500; line-height: 1.3; text-align: center; }
/* Hide arrow on image_cards (Woofz-style: image dominates, no chevron chrome). */
.quiz-option--image_cards .quiz-option-arrow { display: none; }
/* Emoji + label render inline as one row under the image: "♂ Hane" */
.quiz-option--image_cards .quiz-option-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.quiz-option--image_cards .quiz-option-emoji { font-size: 16px; line-height: 1; }

/* Subtle gender tint on image_cards (Doginwork). Only applies when option.value
 * is "han"/"hon" - other quizzes using image_cards keep the default brand bg. */
.quiz-option--image_cards[data-quiz-opt-value="han"] {
  background: #E8F0F9;
}
.quiz-option--image_cards[data-quiz-opt-value="hon"] {
  background: #F8E8EC;
}
.quiz-option--image_cards[data-quiz-opt-value="han"]:hover {
  background: #DCE8F5;
}
.quiz-option--image_cards[data-quiz-opt-value="hon"]:hover {
  background: #F5DCE3;
}

.quiz-option--chips {
  width: auto;
  min-height: 0;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  flex: 0 0 auto;
  justify-content: center;
}
.quiz-option--chips .quiz-option-label { flex: 0 0 auto; }
.quiz-option-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 8px; }
.quiz-option-img-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  border: 2px dashed rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: rgba(0,0,0,0.4);
}
.quiz-option--image_cards .quiz-option-img-placeholder { width: 100%; max-width: 140px; aspect-ratio: 1 / 1; border-radius: 12px; border: 2px dashed rgba(0,0,0,0.15); flex: 0 0 auto; margin: 0 auto; }
.quiz-option-img-placeholder-label {
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
  font-style: italic;
}
.quiz-option--image_cards .quiz-option-img { width: 100%; max-width: 110px; height: auto; aspect-ratio: 1 / 1; border-radius: 12px; flex: 0 0 auto; object-fit: contain; margin: 0 auto; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 400; flex: 1; }

.quiz-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 0; }
.quiz-loading-spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(0,0,0,0.08);
  border-top-color: var(--quiz-brand);
  border-radius: 50%;
  animation: quiz-spin 0.8s linear infinite;
}
@keyframes quiz-spin { to { transform: rotate(360deg); } }
.quiz-loading-text { font-size: 16px; color: var(--quiz-text-secondary); }

.quiz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: var(--quiz-cta-padding);
  border-radius: var(--quiz-cta-radius);
  font-size: 18px; font-weight: 700; font-family: var(--quiz-font);
  letter-spacing: 0.2px;
  cursor: pointer; border: none;
  transition: opacity 0.2s, transform 0.2s, background-color 0.2s;
  min-height: 56px;
}
.quiz-btn:hover { opacity: 0.92; }
.quiz-btn:active { transform: scale(0.98); }
.quiz-btn[disabled] {
  background: color-mix(in srgb, var(--quiz-brand) 45%, #FFFFFF) !important;
  color: #FFFFFF !important;
  cursor: not-allowed;
  opacity: 1 !important;
}
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }

/* Fixed-bottom CTA + escape-link wrapper for multi-select questions and
 * single-select with escape (raising.dog / EveryDoggy pattern). Pinned to
 * viewport bottom so the user always sees it regardless of how many options
 * the question has. Padding-bottom on .quiz-content reserves space so the
 * last option isn't hidden under the wrapper. */
.quiz-question-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--quiz-keyboard-inset, 0);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
  transition: bottom 0.18s ease-out;
}
.quiz-question-bottom .quiz-question-continue {
  width: 100%;
  max-width: 680px;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  position: static;
}
.quiz-question-bottom .quiz-escape-link { padding: 8px 16px; }
/* Reserve scrollable space so the fixed wrapper never covers the last option.
 * Applied universally - quiz-step layouts without a fixed bottom only get a
 * little extra breathing room, no UX cost. */
/* Bottom-buffer för fixed CTAs (.quiz-question-bottom OR .quiz-continue-wrap).
 * Nu när alla CTAs är fixed-bottom appliceras 180px alltid. */
.quiz-content { padding-bottom: 180px; }

/* Profil-steget (b24) + Offer-steget (boffer) ska ha edge-to-edge content -
 * profile-card-heron är full-bleed (puppy graduation image), och offer-
 * timer-bannern på offer-steget ska gå hela vägen ut. Ta bort .quiz-content's
 * horizontal + top padding så iframen blir full viewport-bredd. (William
 * 2026-05-04 v3 - splittade tillbaka från merged) */
.quiz-shell.profil-step .quiz-content,
.quiz-shell.offer-step .quiz-content {
  padding: 0 0 64px;
  gap: 0;
}

/* Offer-step: göm runtime's auto-Continue button. Sidan har inline CTA-
 * knappar (.v20-cta) som postMessar continue själva. (William 2026-05-04 v3) */
.quiz-shell.offer-step .quiz-continue-wrap { display: none; }
.quiz-shell.offer-step .quiz-content { padding-bottom: 32px; }
/* Inline CTA fallback (used by dropdown layout where Continue is rendered
 * inline below the input, not in the fixed wrapper). */
.quiz-question--dropdown .quiz-question-continue {
  position: static;
  margin-top: 24px;
}

/* Escape link rendered under the CTA (raising.dog / EveryDoggy
 * "I don't know my dog's breed" / "None of the above" pattern). Bypasses
 * normal validation - submits with a hidden option-id so analytics still
 * captures the answer. */
.quiz-escape-link {
  display: block;
  margin: 0 auto;
  padding: 12px 16px;
  background: transparent;
  border: none;
  font-family: var(--quiz-font);
  font-size: 14px;
  font-weight: 600;
  color: var(--quiz-brand);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  text-align: center;
}
.quiz-escape-link:hover { opacity: 0.75; }
.quiz-escape-link:focus-visible {
  outline: 2px solid var(--quiz-brand);
  outline-offset: 2px;
  border-radius: 4px;
}

.quiz-email-form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.quiz-email-input {
  width: 100%; padding: 16px 18px;
  border: 1.5px solid rgba(0,0,0,0.15); border-radius: 12px;
  font-size: 16px; font-family: var(--quiz-font);
  background: #fff; color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-email-input:focus { border-color: var(--quiz-brand); border-width: 2px; }
.quiz-email-error { font-size: 13px; color: #dc2626; }

/* Inline Continue (slider/text_input/custom_html): fixed-bottom samma stil
 * som .quiz-question-bottom så CTA-positionen är enhetlig genom hela quizet
 * (William 2026-04-30).
 *
 * bottom-värdet använder --quiz-keyboard-inset (set av App.tsx VisualViewport-
 * listener 2026-05-03) så CTA pushas upp ovanför iOS/Android-tangentbordet på
 * text_input/dropdown-steg. Fallback till 0 när keyboard ej öppen. */
.quiz-continue-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--quiz-keyboard-inset, 0);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 16px;
  background: linear-gradient(to top, var(--quiz-bg) 70%, color-mix(in srgb, var(--quiz-bg) 85%, transparent) 100%);
  transition: bottom 0.18s ease-out;
}
.quiz-continue-wrap .quiz-btn--primary {
  width: 100%;
  max-width: 680px;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
/* Steg som ska ha inline-CTA istället för fixed-bottom (William 2026-04-30
 * - profile-card behöver natural flow så CTA inte täcker innehåll).
 *
 * 2026-05-03: Utökad till educational interstitials (Pattern Reveal,
 * Competitive destruction, Puppy blues) - sticky CTA gjorde att användare
 * skippade slidens content innan de läst. Inline CTA tvingar scroll =
 * tvingar konsumption, per quiz-knowledge "loading screen captive attention"-
 * principen applicerad på högvärdiga insight panels. */
.quiz-continue-wrap[data-step-name*="Profil"],
.quiz-continue-wrap[data-step-name*="Pattern Reveal"],
.quiz-continue-wrap[data-step-name*="Competitive destruction"],
.quiz-continue-wrap[data-step-name*="Puppy blues"] {
  position: static;
  background: transparent;
  padding: 24px 16px 8px;
}

.quiz-dropdown { position: relative; width: 100%; }
.quiz-dropdown-input {
  width: 100%;
  background: var(--quiz-option-bg);
  border: 2px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  padding: 14px 16px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-dropdown-input::placeholder { color: rgba(0,0,0,0.35); }
.quiz-dropdown-input:focus,
.quiz-dropdown--open .quiz-dropdown-input { border-color: var(--quiz-brand); }
.quiz-dropdown-chips--stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.quiz-dropdown-list {
  list-style: none;
  padding: 4px 0;
  margin: 6px 0 0 0;
  overflow-y: auto;
  max-height: 280px;
  background: #fff;
  border: 1.5px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
.quiz-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 10px 14px;
  font-size: 15px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
}
.quiz-dropdown-item:hover { background: rgba(0,0,0,0.04); }
.quiz-dropdown-item--selected { background: color-mix(in srgb, var(--quiz-brand) 10%, transparent); }
.quiz-dropdown-item--selected:hover { background: color-mix(in srgb, var(--quiz-brand) 14%, transparent); }
.quiz-dropdown-check {
  width: 18px;
  height: 18px;
  border: 1.5px solid rgba(0,0,0,0.2);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: #fff;
  background: #fff;
  flex-shrink: 0;
}
.quiz-dropdown-check--on { background: var(--quiz-brand); border-color: var(--quiz-brand); }
.quiz-dropdown-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.quiz-dropdown-chip {
  font-size: 13px;
  background: color-mix(in srgb, var(--quiz-brand) 12%, transparent);
  color: var(--quiz-text-primary);
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quiz-dropdown-chip--more {
  background: rgba(0,0,0,0.06);
}
.quiz-dropdown-emoji { font-size: 18px; }
.quiz-dropdown-empty {
  padding: 12px 14px;
  font-size: 14px;
  color: var(--quiz-text-secondary);
  font-style: italic;
}

.quiz-text-input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--quiz-option-border);
  border-radius: var(--quiz-option-radius, 16px);
  font-size: 16px;
  font-family: var(--quiz-font);
  background: var(--quiz-option-bg);
  color: var(--quiz-text-primary);
  outline: none;
  transition: border-color 0.15s;
}
.quiz-text-input:focus {
  border-color: var(--quiz-brand);
}
.quiz-text-input::placeholder {
  color: rgba(0,0,0,0.35);
}

.quiz-range {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 4px;
}
.quiz-range-value {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  color: var(--quiz-text-primary);
}
.quiz-range-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(
    to right,
    var(--quiz-brand) 0,
    var(--quiz-brand) var(--quiz-range-pct, 50%),
    rgba(0,0,0,0.1) var(--quiz-range-pct, 50%),
    rgba(0,0,0,0.1) 100%
  );
  outline: none;
}
.quiz-range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--quiz-brand);
  border: 3px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
}
.quiz-range-input::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--quiz-brand);
  border: 3px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: pointer;
  border: none;
}
.quiz-range-bounds {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--quiz-text-secondary);
}

.quiz-testimonial-slider {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quiz-testimonial-card {
  display: flex;
  gap: 14px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 10px;
  padding: 16px;
}
.quiz-testimonial-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.quiz-testimonial-body { flex: 1; min-width: 0; }
.quiz-testimonial-name { font-weight: 600; font-size: 15px; color: var(--quiz-text-primary); margin-bottom: 2px; }
.quiz-testimonial-rating { color: #f59e0b; font-size: 13px; margin-bottom: 4px; letter-spacing: 1px; }
.quiz-testimonial-rating-empty { color: rgba(0,0,0,0.15); }
.quiz-testimonial-text { font-size: 14px; line-height: 1.5; color: var(--quiz-text-secondary); }
.quiz-testimonial-nav { display: flex; align-items: center; justify-content: center; gap: 12px; }
.quiz-testimonial-prev, .quiz-testimonial-next {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--quiz-option-bg);
  border: 1.5px solid rgba(0,0,0,0.15);
  color: var(--quiz-text-primary);
  font-size: 16px;
  cursor: pointer;
}
.quiz-testimonial-dots { display: flex; gap: 6px; }
.quiz-testimonial-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(0,0,0,0.2);
  border: none;
  padding: 0;
  cursor: pointer;
}
.quiz-testimonial-dot--active { background: var(--quiz-brand); transform: scale(1.2); }

.quiz-preview-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  background: rgba(17, 24, 39, 0.94);
  color: #fff;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.4;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  animation: quiz-toast-in 0.2s ease-out;
  z-index: 9999;
}
@keyframes quiz-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* Custom HTML on profile/result screens — strengthen visual hierarchy
   without reintroducing arbitrary imported CSS. Targets common patterns
   from imported quizzes (severity labels, stat rows, divider lines). */
.quiz-custom-html h1, .quiz-custom-html h2, .quiz-custom-html h3 {
  color: var(--quiz-text-primary);
  line-height: 1.3;
  margin: 12px 0 6px;
}
.quiz-custom-html h1 { font-size: 22px; font-weight: 700; }
.quiz-custom-html h2 { font-size: 20px; font-weight: 700; }
.quiz-custom-html h3 { font-size: 17px; font-weight: 600; }
.quiz-custom-html strong, .quiz-custom-html b { color: var(--quiz-text-primary); }
.quiz-custom-html hr {
  border: none;
  border-top: 1px solid rgba(0,0,0,0.08);
  margin: 14px 0;
}
.quiz-custom-html ul, .quiz-custom-html ol {
  padding-left: 20px;
  margin: 8px 0;
}
.quiz-custom-html li { margin-bottom: 4px; }

@media (max-width: 480px) {
  /* Mobile: tight horizontal padding + 180px bottom för fixed CTA. */
  .quiz-content { padding: 20px 10px 180px; }
}
  `;
  document.head.appendChild(style);
}
