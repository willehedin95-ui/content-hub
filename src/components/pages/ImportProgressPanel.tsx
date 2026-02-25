"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

interface Props {
  swipeJobId: string;
  pageId: string;
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 30 * 60 * 1000; // 30 minutes

type Substep = "fetching" | "rewriting" | "restoring" | "done" | "error";

export default function ImportProgressPanel({ swipeJobId, pageId }: Props) {
  const router = useRouter();
  const [substep, setSubstep] = useState<Substep>("rewriting");
  const [progress, setProgress] = useState("Waiting for worker...");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(true);
  const completedRef = useRef(false);

  // Elapsed timer
  useEffect(() => {
    if (substep === "done" || substep === "error") return;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [substep]);

  const saveAndRefresh = useCallback(
    async (rewrittenHtml: string, name?: string) => {
      if (completedRef.current) return;
      completedRef.current = true;

      setSubstep("restoring");
      setProgress("Saving to page...");

      const body: Record<string, unknown> = {
        original_html: rewrittenHtml,
        status: "ready",
      };
      if (name) body.name = name;

      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setSubstep("done");
      setProgress("Import complete!");

      // Refresh the page to show full content
      setTimeout(() => router.refresh(), 500);
    },
    [pageId, router]
  );

  // Polling
  useEffect(() => {
    pollingRef.current = true;
    const startTime = Date.now();

    async function poll() {
      while (pollingRef.current) {
        if (Date.now() - startTime > POLL_TIMEOUT) {
          setError("Timed out waiting for rewrite (30 min limit)");
          setSubstep("error");
          return;
        }

        try {
          const res = await fetch(`/api/swipe/${swipeJobId}`);
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server error (${res.status}): ${text.slice(0, 150)}`);
          }

          const data = await res.json();

          if (data.status === "completed" && data.rewrittenHtml) {
            await saveAndRefresh(data.rewrittenHtml);
            return;
          }

          if (data.status === "failed") {
            setError(data.error || "Rewrite failed");
            setSubstep("error");
            return;
          }

          // Update progress
          if (data.progress) {
            if (data.progress.chars > 0) {
              setSubstep("rewriting");
            }
            setProgress(data.progress.message);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Polling failed");
          setSubstep("error");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      }
    }

    poll();

    return () => {
      pollingRef.current = false;
    };
  }, [swipeJobId, saveAndRefresh]);

  async function handleRetry() {
    setRetrying(true);
    setError(null);
    setSubstep("rewriting");
    setProgress("Retrying...");
    completedRef.current = false;

    try {
      const res = await fetch("/api/swipe/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: swipeJobId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Retry failed");
      }

      // Polling will resume via the useEffect
      pollingRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
      setSubstep("error");
    } finally {
      setRetrying(false);
    }
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeStr =
    minutes > 0
      ? `${minutes}:${secs.toString().padStart(2, "0")}`
      : `${secs}s`;

  const steps: { key: Substep; label: string }[] = [
    { key: "fetching", label: "Fetching competitor page" },
    { key: "rewriting", label: "Rewriting copy with Claude" },
    { key: "restoring", label: "Restoring HTML structure" },
  ];

  function getStepState(stepKey: Substep): "active" | "done" | "pending" {
    const order: Substep[] = ["fetching", "rewriting", "restoring", "done"];
    const currentIdx = order.indexOf(substep);
    const stepIdx = order.indexOf(stepKey);

    if (substep === "error") {
      // Mark completed steps as done, current as active
      if (stepIdx < currentIdx) return "done";
      return "pending";
    }

    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        {substep !== "done" && substep !== "error" && (
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
        )}
        {substep === "done" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        )}
        {substep === "error" && (
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        )}
        <h2 className="text-sm font-semibold text-gray-900">
          {substep === "done"
            ? "Import Complete"
            : substep === "error"
              ? "Import Failed"
              : "Importing Page..."}
        </h2>
      </div>

      <div className="space-y-3 mb-5">
        {steps.map((s) => {
          const state = getStepState(s.key);
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  state === "active"
                    ? "bg-indigo-100 ring-2 ring-indigo-400"
                    : state === "done"
                      ? "bg-emerald-100"
                      : "bg-gray-100"
                }`}
              >
                {state === "active" ? (
                  <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                ) : state === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-sm ${
                    state === "active"
                      ? "text-gray-900 font-medium"
                      : state === "done"
                        ? "text-gray-400"
                        : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                {state === "active" && progress && (
                  <span className="text-xs text-gray-400">{progress}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 mt-1 font-medium disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              {retrying ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      )}

      {substep !== "done" && substep !== "error" && (
        <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
          <span>Elapsed: {timeStr}</span>
          <span>Usually takes 5-15 minutes</span>
        </div>
      )}

      {substep !== "done" && substep !== "error" && (
        <p className="text-xs text-gray-400 mt-3">
          You can navigate away safely — the import will continue in the background.
        </p>
      )}
    </div>
  );
}
