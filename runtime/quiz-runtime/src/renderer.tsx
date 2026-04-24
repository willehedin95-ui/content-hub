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
