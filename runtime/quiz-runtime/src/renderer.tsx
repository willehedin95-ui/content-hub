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

export function interpolate(
  text: string,
  variables: Record<string, string> | undefined,
): string {
  if (!variables || !text.includes("{")) return text;
  return text.replace(/\{([a-zA-Z_][\w]*)\}/g, (m, name) => {
    const v = variables[name];
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
 * Defensive post-process sanitizer for custom_html blocks.
 * Strips elements that should never appear in rendered quiz content:
 * SVGs (stray Heyflow carousel chevrons), photo-carousel remnants,
 * hidden inputs, scripts, and styles.
 * If nothing visible remains the wrapper is hidden entirely.
 */
function sanitizeCustomHtml(root: HTMLDivElement): void {
  // Tags to remove unconditionally
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
  // Hide wrapper when nothing visible remains
  if (root.innerText.trim().length === 0) {
    root.style.display = "none";
  }
}

function CustomHtmlEl({ el }: { el: Extract<SubEl, { kind: "custom_html" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Safe: content is editor-controlled HTML (not user input)
    if (ref.current) {
      ref.current.innerHTML = el.html; // nosec
      sanitizeCustomHtml(ref.current);
    }
  }, [el.html]);
  return (
    <div
      ref={ref}
      data-quiz-el="custom_html"
      data-quiz-el-id={el.id}
      class="quiz-custom-html"
    />
  );
}

function LoadingEl({
  el,
  onComplete,
}: {
  el: Extract<SubEl, { kind: "loading" }>;
  onComplete: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onComplete, el.seconds * 1000);
    return () => clearTimeout(t);
  }, [el.seconds, onComplete]);

  return (
    <div
      data-quiz-el="loading"
      data-quiz-el-id={el.id}
      class="quiz-loading"
    >
      <div class="quiz-loading-spinner" />
      {el.text && <p class="quiz-loading-text">{el.text}</p>}
    </div>
  );
}

function OptionButton({
  option,
  layout,
  selected,
  onClick,
}: {
  option: QuestionOption;
  layout: "list" | "cards" | "image_cards" | "dropdown";
  selected: boolean;
  onClick: () => void;
}) {
  const cls = [
    "quiz-option",
    `quiz-option--${layout}`,
    selected ? "quiz-option--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      class={cls}
      data-quiz-opt-id={option.id}
      onClick={onClick}
      type="button"
    >
      {layout === "image_cards" && option.imageUrl && (
        <img src={option.imageUrl} alt={option.label} class="quiz-option-img" />
      )}
      {option.emoji && <span class="quiz-option-emoji">{option.emoji}</span>}
      <span class="quiz-option-label">{option.label}</span>
    </button>
  );
}

function QuestionEl({
  el,
  onAnswer,
  market,
}: {
  el: Extract<SubEl, { kind: "question" }>;
  onAnswer: (questionElId: string, optionId: string) => void;
  market: string | undefined;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleClick = (optId: string) => {
    if (el.kindOf === "single") {
      setSelected(new Set([optId]));
      // Small delay so user sees the selection before advance
      setTimeout(() => onAnswer(el.id, optId), 200);
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
  // as-is for list/cards/image_cards.
  if (el.layout === "dropdown") {
    return (
      <DropdownQuestion el={el} onPick={(optId) => handleClick(optId)} market={market} />
    );
  }

  return (
    <div
      data-quiz-el="question"
      data-quiz-el-id={el.id}
      class={`quiz-question quiz-question--${el.layout}`}
    >
      {el.options.map((opt) => (
        <OptionButton
          key={opt.id}
          option={opt}
          layout={el.layout}
          selected={selected.has(opt.id)}
          onClick={() => handleClick(opt.id)}
        />
      ))}
      {el.kindOf === "multi" && selected.size > 0 && (
        <button
          class="quiz-btn quiz-btn--primary quiz-question-continue"
          type="button"
          onClick={() => {
            const firstId = [...selected][0];
            onAnswer(el.id, firstId);
          }}
        >
          {t("continue", market)}
        </button>
      )}
    </div>
  );
}

function DropdownQuestion({
  el,
  onPick,
  market,
}: {
  el: Extract<SubEl, { kind: "question" }>;
  onPick: (optId: string) => void;
  market: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? el.options.filter((o) => o.label.toLowerCase().includes(q))
    : el.options;

  const placeholder =
    el.dropdownPlaceholder || (el.searchable ? t("searchPlaceholder", market) : t("selectPlaceholder", market));

  return (
    <div
      class={`quiz-dropdown${open ? " quiz-dropdown--open" : ""}`}
      data-quiz-el="question"
      data-quiz-el-id={el.id}
      ref={rootRef}
    >
      <button
        type="button"
        class="quiz-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span class={pickedLabel ? "" : "quiz-dropdown-placeholder"}>
          {pickedLabel ?? placeholder}
        </span>
        <span class="quiz-dropdown-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div class="quiz-dropdown-panel">
          {el.searchable && (
            <input
              type="text"
              class="quiz-dropdown-search"
              placeholder={placeholder}
              value={query}
              autoFocus
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          )}
          <ul class="quiz-dropdown-list">
            {filtered.length === 0 && (
              <li class="quiz-dropdown-empty">{t("noMatches", market)}</li>
            )}
            {filtered.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  class="quiz-dropdown-item"
                  data-quiz-opt-id={opt.id}
                  onClick={() => {
                    setPickedLabel(opt.label);
                    setOpen(false);
                    setQuery("");
                    onPick(opt.id);
                  }}
                >
                  {opt.emoji && <span class="quiz-dropdown-emoji">{opt.emoji}</span>}
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
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
  const showContinueBtn = !hasQuestion && !hasLoading && typeof onContinue === "function";

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
            return <CustomHtmlEl key={el.id} el={el} />;
          case "loading":
            return (
              <LoadingEl key={el.id} el={el} onComplete={onLoadingComplete} />
            );
          case "question":
            return (
              <QuestionEl key={el.id} el={el} onAnswer={onAnswer} market={market} />
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
        <div class="quiz-continue-wrap">
          <button
            class="quiz-btn quiz-btn--primary"
            type="button"
            onClick={onContinue}
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

  const style = document.createElement("style");
  style.textContent = `
:root {
  --quiz-bg: ${brandColors.background};
  --quiz-text-primary: ${brandColors.textPrimary};
  --quiz-text-secondary: ${brandColors.textSecondary};
  --quiz-brand: ${brandColors.primaryBrand};
  --quiz-option-bg: ${brandColors.optionBackground};
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
  justify-content: space-between;
  padding: 16px 20px;
  gap: 12px;
}

.quiz-logo { height: 36px; object-fit: contain; }

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

.quiz-step { display: flex; flex-direction: column; gap: 20px; }

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
.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; gap: 10px; }

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
  padding: 14px;
  min-height: 48px;
  font-size: 14.4px;
  font-weight: 400;
  line-height: 1.3;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  width: 100%;
}
.quiz-option:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.quiz-option--selected {
  background: color-mix(in srgb, var(--quiz-brand) 10%, var(--quiz-option-bg));
  border-color: var(--quiz-brand);
}
.quiz-option--cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 14px 12px;
}
.quiz-option--image_cards {
  width: calc(50% - 5px);
  flex-direction: column;
  text-align: center;
  padding: 0;
  background: rgb(60, 77, 83);
  border: none;
  border-radius: 10px;
  color: #fff;
  overflow: hidden;
  min-height: 0;
}
.quiz-option--image_cards .quiz-option-label { padding: 10px 8px 12px; font-size: 14.4px; font-weight: 500; }
.quiz-option-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 8px; }
.quiz-option--image_cards .quiz-option-img { aspect-ratio: 1 / 1; border-radius: 10px 10px 0 0; }
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
  padding: 16px 28px; border-radius: 12px;
  font-size: 16px; font-weight: 600; font-family: var(--quiz-font);
  cursor: pointer; border: none; transition: opacity 0.15s, transform 0.1s;
}
.quiz-btn:hover { opacity: 0.92; transform: translateY(-1px); }
.quiz-btn:active { transform: translateY(0); }
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }
.quiz-question-continue { margin-top: 12px; }

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

.quiz-continue-wrap { margin-top: 16px; }

.quiz-dropdown { position: relative; width: 100%; }
.quiz-dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--quiz-option-bg);
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
  padding: 14px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
}
.quiz-dropdown--open .quiz-dropdown-trigger { border-color: var(--quiz-brand); }
.quiz-dropdown-placeholder { color: rgba(0,0,0,0.45); }
.quiz-dropdown-chevron { opacity: 0.5; transition: transform 0.2s; }
.quiz-dropdown--open .quiz-dropdown-chevron { transform: rotate(180deg); }
.quiz-dropdown-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1.5px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.12);
  max-height: 320px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.quiz-dropdown-search {
  border: none;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding: 12px 14px;
  font-size: 15px;
  font-family: var(--quiz-font);
  outline: none;
  width: 100%;
}
.quiz-dropdown-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
  overflow-y: auto;
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
  border: 2px solid rgb(0,0,0);
  border-radius: 6px;
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
  .quiz-content { padding: 20px 10px 48px; }
}
  `;
  document.head.appendChild(style);
}
