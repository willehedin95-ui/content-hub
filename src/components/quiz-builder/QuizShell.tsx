"use client";
import { useState } from "react";
import { QuizTopBar } from "./QuizTopBar";
import { LogicCanvas } from "./LogicCanvas";
import { FunnelStepsPanel } from "./FunnelStepsPanel";
import { StepEditor } from "./StepEditor";
import { SettingsPanel } from "./SettingsPanel";
import { useQuiz, useSaveStateChange } from "./QuizContext";

export type ActiveTab = "editor" | "preview" | "settings";

export function QuizShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("editor");
  const [stepsPanelOpen, setStepsPanelOpen] = useState(true);
  const { quiz } = useQuiz();

  // Clarflow-style: the two editing panels (Funnel Steps + element editor) stay
  // put on the editor AND preview tabs; only the right-hand stage swaps between
  // the flow canvas and the live device preview. Settings takes the full width.
  const showPanels = activeTab !== "settings";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <QuizTopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stepsPanelOpen={stepsPanelOpen}
        onToggleStepsPanel={() => setStepsPanelOpen((v) => !v)}
      />
      <div className="flex-1 flex min-h-0">
        {showPanels && (
          <>
            {/* Zone 1 — Funnel Steps accordion (collapsible via X / topbar toggle) */}
            {stepsPanelOpen && (
              <FunnelStepsPanel onClose={() => setStepsPanelOpen(false)} />
            )}
            {/* Zone 2 — contextual element editor */}
            <aside className="w-[360px] border-r border-gray-200 bg-white flex flex-col min-h-0 shrink-0">
              <StepEditor />
            </aside>
          </>
        )}

        {/* Zone 3 — stage: canvas (editor) or live preview (preview) */}
        {activeTab === "editor" && (
          <main className="flex-1 overflow-hidden bg-gray-100 relative min-w-0">
            <LogicCanvas />
          </main>
        )}

        {activeTab === "preview" && (
          <main className="flex-1 overflow-hidden bg-gray-100 flex flex-col min-w-0">
            <PreviewPane quizId={quiz.id} />
          </main>
        )}

        {activeTab === "settings" && (
          <main className="flex-1 overflow-hidden bg-gray-100">
            <div className="h-full overflow-y-auto">
              <div className="max-w-2xl mx-auto py-6 px-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Quiz Settings</h2>
                <div className="flex flex-col gap-4">
                  <SettingsPanel />
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreviewPane — renders the quiz in a sandboxed iframe, live-reloading on save
// ---------------------------------------------------------------------------

type DeviceSize = "mobile" | "tablet" | "desktop";

const DEVICE_SIZES: Record<DeviceSize, { width: number; height: number; label: string }> = {
  mobile: { width: 375, height: 812, label: "Mobile (375)" },
  tablet: { width: 768, height: 1024, label: "Tablet (768)" },
  desktop: { width: 1280, height: 900, label: "Desktop" },
};

function PreviewPane({ quizId }: { quizId: string }) {
  const [device, setDevice] = useState<DeviceSize>("mobile");
  const [key, setKey] = useState(0); // bump to force reload
  const { selectedNodeId, data } = useQuiz();

  // Live-ish preview: reload the iframe whenever an autosave lands, so what
  // you see tracks what you just edited (the preview route reads saved data).
  useSaveStateChange(() => setKey((k) => k + 1));

  // Jump the preview to the step currently being edited (runtime ?goto matches
  // by step name). Falls back to the funnel start if no step is selected.
  const step = selectedNodeId ? data.nodes[selectedNodeId] : null;
  const gotoName = step && step.kind === "step" ? step.name : null;

  const { width, height } = DEVICE_SIZES[device];
  const src = `/quizzes/${quizId}/preview${gotoName ? `?goto=${encodeURIComponent(gotoName)}` : ""}`;

  return (
    <div className="flex flex-col h-full">
      {/* Preview toolbar */}
      <div className="h-10 border-b border-gray-200 bg-white flex items-center gap-3 px-4 shrink-0">
        <span className="text-xs font-medium text-gray-500">Preview as:</span>
        {(Object.entries(DEVICE_SIZES) as [DeviceSize, (typeof DEVICE_SIZES)[DeviceSize]][]).map(
          ([d, { label }]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                device === d
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ),
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400">Updates when you edit</span>
        <button
          type="button"
          onClick={() => setKey((k) => k + 1)}
          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Reload
        </button>
      </div>

      {/* iframe container */}
      <div className="flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-8">
        {device === "desktop" ? (
          <iframe
            key={key}
            src={src}
            title="Quiz preview"
            className="w-full h-full border-0 bg-white shadow-lg rounded"
            style={{ minHeight: height }}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div
            className="relative bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-300"
            style={{ width, height, flexShrink: 0 }}
          >
            <iframe
              key={key}
              src={src}
              title="Quiz preview"
              width={width}
              height={height}
              className="border-0"
              style={{ display: "block" }}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        )}
      </div>
    </div>
  );
}
