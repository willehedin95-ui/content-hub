/** @jsxImportSource preact */
// SubEl renderers. Content comes exclusively from the authenticated editor
// (not user input) so innerHTML is intentional and safe here per the spec.
// If user-generated content is ever added, sanitize first.

import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SubEl, QuestionOption, QuizSettings, StepNode } from "./types";

// ---------------------------------------------------------------------------
// Individual SubEl renderers
// ---------------------------------------------------------------------------

function TitleEl({ el }: { el: Extract<SubEl, { kind: "title" }> }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Safe: content is editor-controlled rich text (not user input)
    if (ref.current) ref.current.innerHTML = el.text; // nosec
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
    if (ref.current) ref.current.innerHTML = el.text; // nosec
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

function CustomHtmlEl({ el }: { el: Extract<SubEl, { kind: "custom_html" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Safe: content is editor-controlled HTML (not user input)
    if (ref.current) ref.current.innerHTML = el.html; // nosec
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
}: {
  el: Extract<SubEl, { kind: "question" }>;
  onAnswer: (questionElId: string, optionId: string) => void;
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
          Continue
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
}: {
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
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
        placeholder="your@email.com"
        value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        required
      />
      {error && <p class="quiz-email-error">{error}</p>}
      <button type="submit" class="quiz-btn quiz-btn--primary quiz-email-submit">
        Continue
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
}: {
  node: StepNode;
  onAnswer: (questionElId: string, optionId: string) => void;
  onLoadingComplete: () => void;
  onEmailSubmit: (email: string) => void;
  captureAtStepId: string | undefined;
}) {
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
              <QuestionEl key={el.id} el={el} onAnswer={onAnswer} />
            );
        }
      })}
      {captureAtStepId === node.id && (
        <EmailCaptureForm onSubmit={onEmailSubmit} />
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
}
.quiz-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 8px;
}
.quiz-logo { height: 32px; object-fit: contain; }
.quiz-back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--quiz-text-secondary);
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
}
.quiz-back-btn:hover { background: rgba(0,0,0,0.06); }
.quiz-step-count {
  font-size: 13px;
  color: var(--quiz-text-secondary);
  margin-left: auto;
}
.quiz-progress {
  width: 100%;
  height: 4px;
  background: rgba(0,0,0,0.08);
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
  max-width: 600px;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.quiz-step { display: flex; flex-direction: column; gap: 16px; }
.quiz-title {
  font-size: clamp(22px, 5vw, 32px);
  font-weight: 700;
  line-height: 1.25;
  color: var(--quiz-text-primary);
}
.quiz-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--quiz-text-secondary);
}
.quiz-image { width: 100%; border-radius: 12px; object-fit: cover; max-height: 300px; }
.quiz-custom-html {}
.quiz-question { display: flex; flex-direction: column; gap: 10px; }
.quiz-question--cards { flex-direction: row; flex-wrap: wrap; }
.quiz-question--image_cards { flex-direction: row; flex-wrap: wrap; }
.quiz-option {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--quiz-option-bg);
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 16px;
  font-family: var(--quiz-font);
  color: var(--quiz-text-primary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  width: 100%;
}
.quiz-option:hover { border-color: var(--quiz-brand); }
.quiz-option--selected {
  border-color: var(--quiz-brand);
  background: color-mix(in srgb, var(--quiz-brand) 10%, var(--quiz-option-bg));
}
.quiz-option--cards { width: calc(50% - 5px); flex-direction: column; text-align: center; padding: 16px 12px; }
.quiz-option--image_cards { width: calc(50% - 5px); flex-direction: column; text-align: center; padding: 12px; }
.quiz-option-img { width: 100%; height: 80px; object-fit: cover; border-radius: 8px; }
.quiz-option-emoji { font-size: 24px; }
.quiz-option-label { font-weight: 500; }
.quiz-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px 0; }
.quiz-loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(0,0,0,0.1);
  border-top-color: var(--quiz-brand);
  border-radius: 50%;
  animation: quiz-spin 0.8s linear infinite;
}
@keyframes quiz-spin { to { transform: rotate(360deg); } }
.quiz-loading-text { font-size: 16px; color: var(--quiz-text-secondary); }
.quiz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 28px; border-radius: 10px;
  font-size: 16px; font-weight: 600; font-family: var(--quiz-font);
  cursor: pointer; border: none; transition: opacity 0.15s;
}
.quiz-btn:hover { opacity: 0.88; }
.quiz-btn--primary { background: var(--quiz-brand); color: #fff; width: 100%; }
.quiz-question-continue { margin-top: 8px; }
.quiz-email-form { display: flex; flex-direction: column; gap: 10px; }
.quiz-email-input {
  width: 100%; padding: 14px 16px;
  border: 2px solid rgba(0,0,0,0.12); border-radius: 10px;
  font-size: 16px; font-family: var(--quiz-font);
  background: var(--quiz-option-bg); color: var(--quiz-text-primary);
  outline: none;
}
.quiz-email-input:focus { border-color: var(--quiz-brand); }
.quiz-email-error { font-size: 13px; color: #dc2626; }
@media (max-width: 400px) {
  .quiz-option--cards, .quiz-option--image_cards { width: 100%; }
}
  `;
  document.head.appendChild(style);
}
