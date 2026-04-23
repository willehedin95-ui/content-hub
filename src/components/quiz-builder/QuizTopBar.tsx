"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, AlertCircle, Globe, Copy, Loader2, BarChart3 } from "lucide-react";
import { useQuiz } from "./QuizContext";
import { useQuizAnalytics } from "./QuizAnalyticsContext";

export function QuizTopBar() {
  const { quiz, saveState, setName } = useQuiz();
  const { enabled: analyticsEnabled, setEnabled: setAnalyticsEnabled, loading: analyticsLoading } =
    useQuizAnalytics();
  const [publishState, setPublishState] = useState<"idle" | "loading" | "done" | "error">(
    quiz.published_url ? "done" : "idle",
  );
  const [publishedUrl, setPublishedUrl] = useState<string | null>(quiz.published_url);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePublish = async () => {
    setPublishState("loading");
    setPublishError(null);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url: string; published_at: string };
      setPublishedUrl(data.url);
      setPublishState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPublishError(msg);
      setPublishState("error");
    }
  };

  const handleCopy = async () => {
    if (!publishedUrl) return;
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const alreadyPublished = !!publishedUrl;

  return (
    <div className="h-14 border-b border-gray-200 bg-white px-4 flex items-center gap-4">
      <Link href="/quizzes" className="p-1.5 hover:bg-gray-100 rounded" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <input
        value={quiz.name}
        onChange={(e) => setName(e.target.value)}
        className="font-medium text-lg bg-transparent border-0 outline-0 focus:bg-gray-50 rounded px-2 py-1"
      />
      <div className="flex-1" />

      {/* Save indicator */}
      {saveState === "saving" || saveState === "dirty" ? (
        <span className="text-xs text-gray-500">Saving...</span>
      ) : saveState === "saved" ? (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <Check size={12} /> Saved
        </span>
      ) : saveState === "error" ? (
        <span className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} /> Error
        </span>
      ) : null}

      {/* Published URL + copy button */}
      {publishedUrl && (
        <div className="flex items-center gap-1.5">
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:underline max-w-[200px] truncate"
            title={publishedUrl}
          >
            {publishedUrl.replace(/^https?:\/\//, "")}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 hover:bg-gray-100 rounded text-gray-500"
            aria-label="Copy URL"
            title="Copy URL"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {/* Publish error */}
      {publishState === "error" && publishError && (
        <span className="text-xs text-red-600 max-w-[160px] truncate" title={publishError}>
          {publishError}
        </span>
      )}

      {/* Analytics toggle */}
      <Link
        href={`/quizzes/${quiz.id}/analytics`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        title="View analytics page"
      >
        <BarChart3 size={14} />
        Analytics
      </Link>

      {/* Overlay toggle */}
      <button
        type="button"
        onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
        disabled={analyticsLoading}
        title={analyticsEnabled ? "Hide analytics overlay" : "Show analytics overlay on canvas"}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
          analyticsEnabled
            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
            : "border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        {analyticsLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <BarChart3 size={14} />
        )}
        Overlay
      </button>

      {/* Publish / Republish button */}
      <button
        type="button"
        onClick={handlePublish}
        disabled={publishState === "loading"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {publishState === "loading" ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Publishing...
          </>
        ) : (
          <>
            <Globe size={14} />
            {alreadyPublished ? "Republish" : "Publish"}
          </>
        )}
      </button>
    </div>
  );
}
