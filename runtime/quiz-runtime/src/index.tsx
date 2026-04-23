/** @jsxImportSource preact */
// Quiz runtime entry point. Reads window globals set by the HTML shell and
// mounts the Preact app into #quiz-root.

import { h, render } from "preact";
import { App } from "./App";
import { injectStyles } from "./renderer";

function mount() {
  const data = window.__QUIZ_DATA__;
  const settings = window.__QUIZ_SETTINGS__;
  const config = window.__QUIZ_CONFIG__;

  if (!data || !settings || !config) {
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

  render(<App data={data} settings={settings} config={config} />, root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
