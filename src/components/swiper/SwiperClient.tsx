"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Loader2,
  ArrowRight,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import type { ProductImage } from "@/types";
import ImageMapper from "./ImageMapper";

interface ProductWithImages {
  id: string;
  slug: string;
  name: string;
  product_images: ProductImage[];
}

type Step = "input" | "swiping" | "review" | "saving";

interface SwipeResult {
  rewrittenHtml: string;
  originalHtml: string;
  images: { src: string; alt: string }[];
  usage: { inputTokens: number; outputTokens: number };
}

interface Props {
  products: ProductWithImages[];
}

export default function SwiperClient({ products }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? ""
  );
  const [selectedAngle, setSelectedAngle] = useState("auto-detect");
  const [error, setError] = useState<string | null>(null);
  const [swipeResult, setSwipeResult] = useState<SwipeResult | null>(null);
  const [imageReplacements, setImageReplacements] = useState<
    Record<string, string>
  >({});
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [savedPageId, setSavedPageId] = useState<string | null>(null);
  const [swipeSubstep, setSwipeSubstep] = useState<"fetching" | "rewriting" | "restoring">("fetching");
  const [swipeProgress, setSwipeProgress] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Elapsed timer during swiping
  useEffect(() => {
    if (step === "swiping") {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  /** Safely parse a fetch response — handles non-JSON error pages (e.g. Vercel 504) */
  async function safeJson<T>(res: Response, fallbackMsg: string): Promise<T> {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || fallbackMsg);
      return data as T;
    } catch (err) {
      if (err instanceof SyntaxError) {
        // Non-JSON response — typically a Vercel timeout or crash page
        if (res.status === 504) {
          throw new Error(
            "The server function timed out. This page may be too large for the current hosting plan (60s limit). Try a smaller page, or upgrade Vercel to Pro for 5-minute timeouts."
          );
        }
        throw new Error(`Server error (${res.status}): ${text.slice(0, 150)}`);
      }
      throw err;
    }
  }

  /** Read SSE stream from /api/swipe and return the final result */
  async function readSwipeStream(res: Response): Promise<SwipeResult> {
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: SwipeResult | null = null;
    let streamError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events (separated by double newline)
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!; // Keep incomplete event in buffer

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event: "));
        const dataLine = lines.find((l) => l.startsWith("data: "));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.slice(7);
        const data = JSON.parse(dataLine.slice(6));

        if (eventType === "progress") {
          if (data.step === "restoring") setSwipeSubstep("restoring");
          if (data.message) setSwipeProgress(data.message);
        } else if (eventType === "done") {
          result = data as SwipeResult;
        } else if (eventType === "error") {
          streamError = data.message || "Rewrite failed";
        }
      }
    }

    if (streamError) throw new Error(streamError);
    if (!result) throw new Error("Stream ended without a result");
    return result;
  }

  async function handleSwipe() {
    if (!url.trim() || !selectedProductId) return;
    setError(null);
    setStep("swiping");
    setSwipeProgress("");

    try {
      // Step 1: Fetch the competitor page
      setSwipeSubstep("fetching");
      const fetchRes = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const { html, title } = await safeJson<{ html: string; title: string }>(
        fetchRes,
        "Failed to fetch URL"
      );

      // Set default page name from title
      if (title && !pageName) {
        setPageName(title);
        setPageSlug(
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60)
        );
      }

      // Step 2: Stream Claude rewrite via SSE
      setSwipeSubstep("rewriting");
      const swipeRes = await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          productId: selectedProductId,
          sourceUrl: url.trim(),
          sourceLanguage: "en",
          angle: selectedAngle,
        }),
      });

      // Check for non-SSE error responses (e.g. 400, 504)
      const contentType = swipeRes.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        // Fallback: response is JSON (error case)
        await safeJson<never>(swipeRes, "Swipe failed");
      }

      const result = await readSwipeStream(swipeRes);
      setSwipeResult(result);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  }

  function applyImageReplacements(html: string): string {
    let result = html;
    for (const [originalSrc, newSrc] of Object.entries(imageReplacements)) {
      // Replace in both src="" and src='' attributes
      result = result.split(originalSrc).join(newSrc);
    }
    return result;
  }

  async function handleSave() {
    if (!swipeResult || !pageName.trim() || !pageSlug.trim()) return;
    setStep("saving");
    setError(null);

    try {
      const finalHtml = applyImageReplacements(swipeResult.rewrittenHtml);

      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pageName.trim(),
          product: selectedProduct?.slug ?? "happysleep",
          page_type: "advertorial",
          source_url: url.trim(),
          original_html: finalHtml,
          slug: pageSlug.trim(),
          source_language: "en",
          swiped_from_url: url.trim(),
          tags: ["swiped"],
        }),
      });

      const page = await safeJson<{ id: string }>(res, "Failed to save page");
      setSavedPageId(page.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStep("review");
    }
  }

  // Input step
  if (step === "input") {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Wand2 className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Page Swiper</h1>
          <p className="text-sm text-gray-500 mt-2">
            Paste a competitor URL and we&apos;ll rewrite it for your product
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Competitor URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://competitor.com/their-page"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Product
            </label>
            {products.length === 0 ? (
              <p className="text-sm text-gray-400">
                No products yet.{" "}
                <button
                  onClick={() => router.push("/products")}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  Create one first
                </button>
              </p>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Advertising Angle
            </label>
            <select
              value={selectedAngle}
              onChange={(e) => setSelectedAngle(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="auto-detect">Auto-detect (match source)</option>
              <option value="neck-pain">Neck Pain</option>
              <option value="snoring">Snoring</option>
              <option value="sleep-quality">Sleep Quality</option>
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleSwipe}
            disabled={!url.trim() || !selectedProductId}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Swipe Page
          </button>
        </div>
      </div>
    );
  }

  // Swiping step (loading)
  if (step === "swiping") {
    const minutes = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeStr = minutes > 0
      ? `${minutes}:${secs.toString().padStart(2, "0")}`
      : `${secs}s`;

    return (
      <div className="max-w-md mx-auto py-20 px-6">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-5" />

          <div className="space-y-3 mb-6">
            {/* Step 1: Fetch */}
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                swipeSubstep === "fetching"
                  ? "bg-indigo-100 ring-2 ring-indigo-400"
                  : "bg-emerald-100"
              }`}>
                {swipeSubstep === "fetching" ? (
                  <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                )}
              </div>
              <span className={`text-sm ${
                swipeSubstep === "fetching" ? "text-gray-900 font-medium" : "text-gray-400"
              }`}>
                Fetching competitor page
              </span>
            </div>

            {/* Step 2: Rewrite */}
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                swipeSubstep === "rewriting"
                  ? "bg-indigo-100 ring-2 ring-indigo-400"
                  : swipeSubstep === "restoring"
                    ? "bg-emerald-100"
                    : "bg-gray-100"
              }`}>
                {swipeSubstep === "rewriting" ? (
                  <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                ) : swipeSubstep === "restoring" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>
              <div className="flex flex-col">
                <span className={`text-sm ${
                  swipeSubstep === "rewriting" ? "text-gray-900 font-medium" : swipeSubstep === "restoring" ? "text-gray-400" : "text-gray-400"
                }`}>
                  Rewriting copy with Claude
                </span>
                {swipeSubstep === "rewriting" && swipeProgress && (
                  <span className="text-xs text-gray-400">{swipeProgress}</span>
                )}
              </div>
            </div>

            {/* Step 3: Restore */}
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                swipeSubstep === "restoring"
                  ? "bg-indigo-100 ring-2 ring-indigo-400"
                  : "bg-gray-100"
              }`}>
                {swipeSubstep === "restoring" ? (
                  <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>
              <span className={`text-sm ${
                swipeSubstep === "restoring" ? "text-gray-900 font-medium" : "text-gray-400"
              }`}>
                Restoring HTML structure
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
            <span>Elapsed: {timeStr}</span>
            <span>Usually takes 2-5 minutes</span>
          </div>
        </div>
      </div>
    );
  }

  // Saving complete
  if (step === "saving" && savedPageId) {
    return (
      <div className="max-w-2xl mx-auto py-24 px-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900">Page Saved!</h2>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          Your swiped page is ready. You can now translate it to other languages.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => router.push(`/pages/${savedPageId}`)}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Open in Editor
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setStep("input");
              setSwipeResult(null);
              setUrl("");
              setSelectedAngle("auto-detect");
              setPageName("");
              setPageSlug("");
              setImageReplacements({});
              setSavedPageId(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Swipe Another
          </button>
        </div>
      </div>
    );
  }

  // Saving in progress
  if (step === "saving") {
    return (
      <div className="max-w-2xl mx-auto py-24 px-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900">Saving page...</h2>
      </div>
    );
  }

  // Review step
  return (
    <div className="max-w-6xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Review Swiped Page</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedProduct?.name} &middot;{" "}
            {selectedAngle !== "auto-detect" ? `${selectedAngle} angle` : "auto-detect"}{" "}
            &middot; {url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              showOriginal
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {showOriginal ? "Show Swiped" : "Show Original"}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <iframe
          srcDoc={
            showOriginal
              ? swipeResult?.originalHtml
              : applyImageReplacements(swipeResult?.rewrittenHtml ?? "")
          }
          className="w-full h-[600px] border-0"
          sandbox="allow-same-origin"
          title="Page preview"
        />
      </div>

      {/* Image Mapper */}
      {swipeResult && swipeResult.images.length > 0 && selectedProduct && (
        <ImageMapper
          pageImages={swipeResult.images}
          productImages={selectedProduct.product_images}
          productId={selectedProductId}
          angle={selectedAngle}
          replacements={imageReplacements}
          onReplacementsChange={setImageReplacements}
        />
      )}

      {/* Save section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Save as Page
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Page Name
            </label>
            <input
              type="text"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="My Swiped Page"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Slug
            </label>
            <input
              type="text"
              value={pageSlug}
              onChange={(e) =>
                setPageSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="my-swiped-page"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!pageName.trim() || !pageSlug.trim()}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save to Hub
          </button>
          <button
            onClick={() => {
              setStep("input");
              setSwipeResult(null);
              setError(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Start Over
          </button>
          {swipeResult && (
            <span className="text-xs text-gray-400 ml-auto">
              Claude: {swipeResult.usage.inputTokens.toLocaleString()} in /{" "}
              {swipeResult.usage.outputTokens.toLocaleString()} out
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
