/** @jsxImportSource preact */
// Quiz runtime entry point. Reads window globals set by the HTML shell and
// mounts the Preact app into #quiz-root.

import { h, render } from "preact";
import { App } from "./App";
import { injectStyles } from "./renderer";
import type { QuizAbConfig } from "./types";

/** Whole-quiz A/B pick: sticky per visitor (localStorage), even split by
 *  `splitA`, with a `?ab=A|B` override for testing. Returns 'a' | 'b'. */
function pickAbVariant(quizId: string, ab: QuizAbConfig): "a" | "b" {
  const key = `quiz_${quizId}_ab_${ab.id}`;
  try {
    const override = new URLSearchParams(location.search).get("ab");
    if (override) {
      const v = override.toUpperCase() === "B" ? "b" : "a";
      localStorage.setItem(key, v);
      return v;
    }
  } catch { /* ignore */ }
  try {
    const stored = localStorage.getItem(key);
    if (stored === "a" || stored === "b") return stored;
  } catch { /* ignore */ }
  const v: "a" | "b" = Math.random() * 100 < (ab.splitA ?? 50) ? "a" : "b";
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
  return v;
}

function mount() {
  const dataA = window.__QUIZ_DATA__;
  const settings = window.__QUIZ_SETTINGS__;
  const config = window.__QUIZ_CONFIG__;
  const ab = window.__QUIZ_AB__;

  if (!dataA || !settings || !config) {
    console.error("[quiz-runtime] Missing __QUIZ_DATA__, __QUIZ_SETTINGS__, or __QUIZ_CONFIG__");
    return;
  }

  // Inject brand CSS vars and base styles before first render
  injectStyles(settings);

  const root = document.getElementById("quiz-root");
  if (!root) {
    console.error("[quiz-runtime] #quiz-root element not found");
    return;
  }

  // Whole-quiz A/B: coin-flip which full spec to render; tag the session so
  // analytics can split A vs B. Absent __QUIZ_AB__ = normal single-variant quiz.
  let data = dataA;
  let abVariant: "a" | "b" | undefined;
  let abExperimentId: string | undefined;
  if (ab && ab.id && ab.dataB) {
    abExperimentId = ab.id;
    abVariant = pickAbVariant(config.quizId, ab);
    if (abVariant === "b") data = ab.dataB;
  }

  render(
    <App
      data={data}
      settings={settings}
      config={config}
      abVariant={abVariant}
      abExperimentId={abExperimentId}
    />,
    root,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
