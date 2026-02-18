"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, Loader2, Image as ImageIcon, Upload, Globe } from "lucide-react";

interface StreamEvent {
  step: "images" | "deploy" | "upload" | "done" | "error";
  current?: number;
  total?: number;
  message?: string;
  url?: string;
  data?: unknown;
}

interface PublishModalProps {
  open: boolean;
  translationId: string;
  onClose: (published: boolean) => void;
}

export default function PublishModal({ open, translationId, onClose }: PublishModalProps) {
  const [step, setStep] = useState<StreamEvent["step"] | "starting">("starting");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("Starting publish…");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [error, setError] = useState("");
  const didStart = useRef(false);

  const reset = useCallback(() => {
    setStep("starting");
    setCurrent(0);
    setTotal(0);
    setMessage("Starting publish…");
    setPublishedUrl("");
    setError("");
    didStart.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && (step === "done" || step === "error")) handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, step]);

  useEffect(() => {
    if (!open || !translationId || didStart.current) return;
    didStart.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translation_id: translationId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Publish failed (${res.status})`);
          setStep("error");
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError("No response stream");
          setStep("error");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event: StreamEvent = JSON.parse(line);
              if (event.step) setStep(event.step);
              if (event.current !== undefined) setCurrent(event.current);
              if (event.total !== undefined) setTotal(event.total);
              if (event.message) setMessage(event.message);
              if (event.url) setPublishedUrl(event.url);
              if (event.step === "error") setError(event.message || "Publish failed");
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Publish failed");
        setStep("error");
      }
    })();

    return () => controller.abort();
  }, [open, translationId]);

  function handleClose() {
    reset();
    onClose(step === "done");
  }

  if (!open) return null;

  const isInProgress = step !== "done" && step !== "error";
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop — no click-to-close while in progress */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isInProgress ? undefined : handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white border border-gray-200 rounded-2xl shadow-xl">
        <div className="p-6">
          {/* Header icon */}
          <div className="flex justify-center mb-4">
            {step === "done" ? (
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            ) : step === "error" ? (
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-center text-lg font-semibold text-gray-900 mb-1">
            {step === "done"
              ? "Published!"
              : step === "error"
                ? "Publish Failed"
                : "Publishing…"}
          </h3>

          {/* Subtitle / message */}
          <p className="text-center text-sm text-gray-500 mb-5">
            {step === "done"
              ? "Your page is now live"
              : step === "error"
                ? error
                : message}
          </p>

          {/* Progress section */}
          {isInProgress && (
            <div className="space-y-3">
              {/* Steps indicator */}
              <div className="flex items-center gap-2 justify-center">
                <StepPill
                  icon={<ImageIcon className="w-3 h-3" />}
                  label="Compress"
                  active={step === "images"}
                  done={step === "deploy" || step === "upload"}
                />
                <ChevronRight />
                <StepPill
                  icon={<Upload className="w-3 h-3" />}
                  label="Upload"
                  active={step === "deploy" || step === "upload"}
                  done={false}
                />
                <ChevronRight />
                <StepPill
                  icon={<Globe className="w-3 h-3" />}
                  label="Live"
                  active={false}
                  done={false}
                />
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>{current} / {total}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success URL */}
          {step === "done" && publishedUrl && (
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-4"
            >
              {publishedUrl}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Actions */}
          {!isInProgress && (
            <button
              onClick={handleClose}
              className={`w-full mt-2 text-sm font-medium py-2.5 rounded-lg transition-colors ${
                step === "done"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {step === "done" ? "Done" : "Close"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPill({ icon, label, active, done }: { icon: React.ReactNode; label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : done
            ? "bg-emerald-50 text-emerald-600"
            : "bg-gray-50 text-gray-400"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function ChevronRight() {
  return (
    <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
