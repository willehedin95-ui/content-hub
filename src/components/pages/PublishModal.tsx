"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";

interface PublishModalProps {
  open: boolean;
  translationId: string;
  onClose: (published: boolean) => void;
}

const POLL_INTERVAL = 2000;

export default function PublishModal({ open, translationId, onClose }: PublishModalProps) {
  const [status, setStatus] = useState<"starting" | "publishing" | "published" | "error">("starting");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [error, setError] = useState("");
  const didStart = useRef(false);
  const pollingRef = useRef(false);

  const reset = useCallback(() => {
    setStatus("starting");
    setPublishedUrl("");
    setError("");
    didStart.current = false;
    pollingRef.current = false;
  }, []);

  // Keyboard escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, status]);

  // Start publish + poll
  useEffect(() => {
    if (!open || !translationId || didStart.current) return;
    didStart.current = true;
    pollingRef.current = true;

    (async () => {
      try {
        // Fire publish request
        const res = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translation_id: translationId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Publish failed (${res.status})`);
          setStatus("error");
          return;
        }

        setStatus("publishing");

        // Poll for completion
        while (pollingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          if (!pollingRef.current) break;

          try {
            const pollRes = await fetch(`/api/publish/${translationId}/status`);
            if (!pollRes.ok) continue;

            const data = await pollRes.json();

            if (data.status === "published") {
              setPublishedUrl(data.published_url || "");
              setStatus("published");
              pollingRef.current = false;
              return;
            }

            if (data.status === "error") {
              setError(data.publish_error || "Publish failed");
              setStatus("error");
              pollingRef.current = false;
              return;
            }

            // If status is no longer "publishing" (e.g. "translated" from recovery),
            // treat as error
            if (data.status !== "publishing") {
              setError("Publish was interrupted");
              setStatus("error");
              pollingRef.current = false;
              return;
            }
          } catch {
            // Network error — keep polling
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Publish failed");
        setStatus("error");
      }
    })();

    return () => {
      pollingRef.current = false;
    };
  }, [open, translationId]);

  function handleClose() {
    pollingRef.current = false;
    const wasPublished = status === "published";
    reset();
    onClose(wasPublished);
  }

  if (!open) return null;

  const isInProgress = status === "starting" || status === "publishing";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white border border-gray-200 rounded-2xl shadow-xl">
        <div className="p-6">
          {/* Header icon */}
          <div className="flex justify-center mb-4">
            {status === "published" ? (
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            ) : status === "error" ? (
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
            {status === "published"
              ? "Published!"
              : status === "error"
                ? "Publish Failed"
                : "Publishing..."}
          </h3>

          {/* Message */}
          <p className="text-center text-sm text-gray-500 mb-5">
            {status === "published"
              ? "Your page is now live"
              : status === "error"
                ? error
                : "Optimizing images and deploying to Cloudflare Pages..."}
          </p>

          {/* Navigation note */}
          {isInProgress && (
            <p className="text-center text-xs text-gray-400 mb-4">
              You can close this and navigate away — publishing will continue in the background.
            </p>
          )}

          {/* Success URL */}
          {status === "published" && publishedUrl && (
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

          {/* Close button */}
          <button
            onClick={handleClose}
            className={`w-full mt-2 text-sm font-medium py-2.5 rounded-lg transition-colors ${
              status === "published"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : status === "error"
                  ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-500"
            }`}
          >
            {status === "published" ? "Done" : status === "error" ? "Close" : "Close (continues in background)"}
          </button>
        </div>
      </div>
    </div>
  );
}
