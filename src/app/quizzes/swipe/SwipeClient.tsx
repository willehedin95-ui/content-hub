"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ArrowRight, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

type Market = "se" | "dk" | "no";

type SwipeResult = {
  quizId: string;
  method: "clarflow" | "generic";
  importedSteps: number;
  warnings: string[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "progress"; step: number }
  | { kind: "success"; result: SwipeResult }
  | { kind: "error"; message: string };

const PROGRESS_STEPS = [
  "Launching browser...",
  "Extracting quiz data...",
  "Re-hosting images...",
  "Creating quiz draft...",
];

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "se", label: "SE - Swedish" },
  { value: "dk", label: "DK - Danish" },
  { value: "no", label: "NO - Norwegian" },
];

export function SwipeClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Market>("se");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function startImport() {
    if (!url.trim()) return;

    setPhase({ kind: "progress", step: 0 });

    // Simulate progress steps visually while the single API call runs.
    // The steps are an approximation of what happens server-side.
    const progressTimer = setInterval(() => {
      setPhase((prev) => {
        if (prev.kind !== "progress") return prev;
        const next = prev.step + 1;
        if (next >= PROGRESS_STEPS.length - 1) {
          clearInterval(progressTimer);
          return { kind: "progress", step: PROGRESS_STEPS.length - 1 };
        }
        return { kind: "progress", step: next };
      });
    }, 3000);

    try {
      const res = await fetch("/api/quiz/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), market, name: name.trim() || undefined }),
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        setPhase({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }

      const result = (await res.json()) as SwipeResult;
      setPhase({ kind: "success", result });
    } catch (err) {
      clearInterval(progressTimer);
      const message = err instanceof Error ? err.message : "Unexpected error";
      setPhase({ kind: "error", message });
    }
  }

  function reset() {
    setUrl("");
    setName("");
    setPhase({ kind: "idle" });
  }

  const isLoading = phase.kind === "progress";

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Download className="w-5 h-5 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Import Quiz</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8 -mt-4">
        Paste a competitor quiz URL to import it as an editable draft. Clarflow quizzes are
        imported in seconds; other quiz platforms use a browser-based scraper.
      </p>

      {/* Form */}
      {(phase.kind === "idle" || phase.kind === "error") && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quiz URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.clarflow.com/my-quiz"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Market</label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as Market)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={isLoading}
              >
                {MARKET_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My imported quiz"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                disabled={isLoading}
              />
            </div>
          </div>

          {phase.kind === "error" && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Import failed</p>
                <p className="mt-0.5 text-red-600">{phase.message}</p>
              </div>
            </div>
          )}

          <button
            onClick={startImport}
            disabled={!url.trim() || isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Start Import
          </button>
        </div>
      )}

      {/* Progress */}
      {phase.kind === "progress" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            {PROGRESS_STEPS.map((label, idx) => {
              const isActive = idx === phase.step;
              const isDone = idx < phase.step;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 text-sm px-4 py-3 rounded-lg border transition-all ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium"
                      : isDone
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : isActive ? (
                    <RefreshCw className="w-4 h-4 text-indigo-500 flex-shrink-0 animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            This can take up to 2-3 minutes for complex quizzes.
          </p>
        </div>
      )}

      {/* Success */}
      {phase.kind === "success" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Import successful</p>
              <p className="text-sm text-green-700 mt-0.5">
                Imported{" "}
                <span className="font-semibold">{phase.result.importedSteps} steps</span> using{" "}
                <span className="font-semibold capitalize">{phase.result.method}</span> method.
                {phase.result.warnings.length > 0 && (
                  <> Some warnings - see below.</>
                )}
              </p>
            </div>
          </div>

          {phase.result.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1.5 uppercase tracking-wide">
                Warnings
              </p>
              <ul className="space-y-1">
                {phase.result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-0.5 text-amber-500">-</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/quizzes/${phase.result.quizId}/edit`)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Open in editor
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Import another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
