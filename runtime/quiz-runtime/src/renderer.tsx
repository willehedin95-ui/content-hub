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

function stripStylesAndClasses(root: HTMLElement | null): void {
  if (!root) return;
  const walk = (el: Element) => {
    el.removeAttribute("style");
    el.removeAttribute("class");
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

// ---------------------------------------------------------------------------
// Individual SubEl renderers
// ---------------------------------------------------------------------------

function TitleEl({ el }: { el: Extract<SubEl, { kind: "title" }> }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Safe: content is editor-controlled rich text (not user input)
    if (ref.current) {
      ref.current.innerHTML = el.text; // nosec
      stripStylesAndClasses(ref.current);
    }
  }, [el.text]);
  return (
    <h1
      ref={ref}
      data-quiz-el="title"
      data-quiz-el-id={el.id}
      class="quiz-title"
    />
  );
}

function TextEl({ el }: { el: Extract<SubEl, { kind: "text" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Safe: content is editor-controlled rich text (not user input)
    if (ref.current) {
      ref.current.innerHTML = el.text; // nosec
      stripStylesAndClasses(ref.current);
    }
  }, [el.text]);
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
  layout: "list" | "cards" | "image_cards";
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
}: {
  node: StepNode;
  onAnswer: (questionElId: string, optionId: string) => void;
  onLoadingComplete: () => void;
  onEmailSubmit: (email: string) => void;
  captureAtStepId: string | undefined;
  market: string | undefined;
  onContinue?: () => void;
}) {
  const hasQuestion = node.subEls.some((el) => el.kind === "question");
  const hasLoading = node.subEls.some((el) => el.kind === "loading");
  const showContinueBtn = !hasQuestion && !hasLoading && typeof onContinue === "function";

  return (
    <div class="quiz-step" data-step-id={node.id}>
      {node.subEls.map((el) => {
        switch (el.kind) {
          case "title":
            return <TitleEl key={el.id} el={el} />;
          case "text":
            return <TextEl key={el.id} el={el} />;
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
  padding: 32px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}

.quiz-step { display: flex; flex-direction: column; gap: 20px; }

.quiz-title {
  font-size: clamp(28px, 5.5vw, 40px);
  font-weight: 800;
  line-height: 1.2;
  color: var(--quiz-text-primary);
  letter-spacing: -0.015em;
  margin-bottom: 4px;
}

.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
}

.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 320px; }

.quiz-custom-html { font-size: 15px; line-height: 1.6; color: var(--quiz-text-secondary); }
.quiz-custom-html a { color: var(--quiz-brand); }
.quiz-custom-html p { margin-bottom: 8px; }
.quiz-custom-html p:last-child { margin-bottom: 0; }

.quiz-question { display: flex; flex-direction: column; gap: 12px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; }

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--quiz-option-bg);
  border: 1.5px solid rgba(0,0,0,0.15);
  border-radius: 12px;
  padding: 18px 20px;
  min-height: 56px;
  font-size: 16px;
  font-weight: 500;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, transform 0.1s, box-shadow 0.15s;
  width: 100%;
}
.quiz-option:hover {
  border-color: rgba(0,0,0,0.35);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.quiz-option--selected {
  border-color: var(--quiz-brand);
  border-width: 2px;
  background: color-mix(in srgb, var(--quiz-brand) 8%, var(--quiz-option-bg));
}
.quiz-option--cards { width: calc(50% - 6px); flex-direction: column; text-align: center; padding: 20px 12px; }
.quiz-option--image_cards { width: calc(50% - 6px); flex-direction: column; text-align: center; padding: 16px 12px; }
.quiz-option-img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 500; flex: 1; }

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

@media (max-width: 480px) {
  .quiz-option--cards, .quiz-option--image_cards { width: 100%; }
  .quiz-content { padding: 24px 16px 48px; }
}
  `;
  document.head.appendChild(style);
}
