"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewActions({
  translationId,
  currentStatus,
}: {
  translationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (currentStatus !== "pending_review") {
    return (
      <div className="text-sm text-gray-500 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        Status: <span className="font-medium">{currentStatus}</span>
      </div>
    );
  }

  async function doAction(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/review/${translationId}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (action === "approve" && data.url) {
        setResult(`Publicerad: ${data.url}`);
      } else {
        setResult("Klart");
      }
      setTimeout(() => router.push("/blog-review"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => doAction("reject")}
          disabled={busy !== null}
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "reject" ? "Avvisar..." : "Avvisa"}
        </button>
        <button
          onClick={() => doAction("approve")}
          disabled={busy !== null}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === "approve" ? "Publicerar..." : "Godkänn & publicera"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
      {result && <p className="text-xs text-green-700 max-w-xs text-right">{result}</p>}
    </div>
  );
}
