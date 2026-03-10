"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  SkipForward,
} from "lucide-react";

interface Props {
  swipeJobId: string;
  pageId: string;
  product?: string;
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const MIN_IMAGE_DIMENSION = 80;

type Substep = "fetching" | "rewriting" | "restoring" | "image_selection" | "generating_images" | "done" | "error";

interface ExtractedImage {
  src: string;
  index: number; // index among all <img> tags in the HTML
  width: number;
  height: number;
  surroundingText: string;
  selected: boolean;
}

type ImageGenStatus = "pending" | "generating" | "done" | "error";

/** Extract images from HTML, filter out icons/tiny images */
function extractImages(html: string): ExtractedImage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img");
  const results: ExtractedImage[] = [];

  imgs.forEach((img, index) => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:image/svg")) return;

    // Filter out tiny images (icons, spacers, tracking pixels)
    const w = parseInt(img.getAttribute("width") || "0", 10);
    const h = parseInt(img.getAttribute("height") || "0", 10);
    if ((w > 0 && w < MIN_IMAGE_DIMENSION) || (h > 0 && h < MIN_IMAGE_DIMENSION)) return;

    // Filter common icon/logo patterns
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    const srcLower = src.toLowerCase();
    if (
      srcLower.includes("logo") ||
      srcLower.includes("icon") ||
      srcLower.includes("favicon") ||
      srcLower.includes("badge") ||
      srcLower.includes("emoji") ||
      alt.includes("logo") ||
      alt.includes("icon")
    ) return;

    // Extract surrounding text
    const surroundingText = getSurroundingTextFromDom(img);

    results.push({
      src,
      index,
      width: w || 400,
      height: h || 400,
      surroundingText,
      selected: true, // default all selected
    });
  });

  return results;
}

/** Get surrounding text from an image's parent section */
function getSurroundingTextFromDom(img: Element): string {
  const sectionTags = ["SECTION", "ARTICLE", "MAIN"];
  const sectionClasses = /section|block|container|wrapper|row|col/i;
  let el = img.parentElement;
  let container: Element | null = null;
  let depth = 0;

  while (el && depth < 5) {
    if (sectionTags.includes(el.tagName) || sectionClasses.test(el.className || "")) {
      container = el;
      break;
    }
    el = el.parentElement;
    depth++;
  }

  if (!container) {
    container = img.parentElement?.parentElement || img.parentElement || null;
  }
  if (!container) return "";

  const textEls = container.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,span,td,th");
  const texts: string[] = [];
  let wordCount = 0;

  textEls.forEach((textEl) => {
    const t = (textEl.textContent || "").trim();
    if (!t) return;
    const words = t.split(/\s+/).length;
    if (wordCount + words > 500) return;
    texts.push(t);
    wordCount += words;
  });

  return texts.join(" \n ");
}

function computeAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  if (ratio > 1.6) return "16:9";
  if (ratio > 1.2) return "4:3";
  if (ratio > 0.9) return "1:1";
  if (ratio > 0.7) return "3:4";
  return "2:3";
}

export default function ImportProgressPanel({ swipeJobId, pageId, product }: Props) {
  const router = useRouter();
  const [substep, setSubstep] = useState<Substep>("rewriting");
  const [progress, setProgress] = useState("Waiting for worker...");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(true);
  const completedRef = useRef(false);

  // Image selection state
  const [rewrittenHtml, setRewrittenHtml] = useState<string | null>(null);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [imageGenStatuses, setImageGenStatuses] = useState<Record<number, ImageGenStatus>>({});
  const [productId, setProductId] = useState<string | null>(null);
  const productFetchedRef = useRef(false);

  // Fetch product UUID from slug
  useEffect(() => {
    if (!product || productFetchedRef.current) return;
    productFetchedRef.current = true;

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Array<{ id: string; slug: string }>) => {
        const match = products.find((p) => p.slug === product);
        if (match) setProductId(match.id);
      })
      .catch(() => {});
  }, [product]);

  // Elapsed timer
  useEffect(() => {
    if (substep === "done" || substep === "error" || substep === "image_selection") return;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [substep]);

  const saveAndRefresh = useCallback(
    async (html: string, name?: string) => {
      if (completedRef.current) return;
      completedRef.current = true;

      setSubstep("restoring");
      setProgress("Saving to page...");

      const body: Record<string, unknown> = {
        original_html: html,
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

      setTimeout(() => router.refresh(), 500);
    },
    [pageId, router]
  );

  /** Called when rewrite finishes — either show image selection or save directly */
  const handleRewriteComplete = useCallback(
    async (html: string) => {
      if (completedRef.current) return;

      // If no product, skip image selection
      if (!product) {
        await saveAndRefresh(html);
        return;
      }

      // Extract images from rewritten HTML
      const images = extractImages(html);
      if (images.length === 0) {
        await saveAndRefresh(html);
        return;
      }

      setRewrittenHtml(html);
      setExtractedImages(images);
      setSubstep("image_selection");
    },
    [product, saveAndRefresh]
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
            await handleRewriteComplete(data.rewrittenHtml);
            return;
          }

          if (data.status === "failed") {
            setError(data.error || "Rewrite failed");
            setSubstep("error");
            return;
          }

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
  }, [swipeJobId, handleRewriteComplete]);

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

      pollingRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
      setSubstep("error");
    } finally {
      setRetrying(false);
    }
  }

  function toggleImage(index: number) {
    setExtractedImages((prev) =>
      prev.map((img) =>
        img.index === index ? { ...img, selected: !img.selected } : img
      )
    );
  }

  function toggleAll() {
    const allSelected = extractedImages.every((img) => img.selected);
    setExtractedImages((prev) =>
      prev.map((img) => ({ ...img, selected: !allSelected }))
    );
  }

  /** Skip image generation — save HTML as-is */
  async function handleSkip() {
    if (!rewrittenHtml) return;
    await saveAndRefresh(rewrittenHtml);
  }

  /** Generate replacement images for selected ones */
  async function handleGenerateImages() {
    if (!rewrittenHtml || !productId) return;

    const selected = extractedImages.filter((img) => img.selected);
    if (selected.length === 0) {
      await saveAndRefresh(rewrittenHtml);
      return;
    }

    setSubstep("generating_images");

    // Init statuses
    const initialStatuses: Record<number, ImageGenStatus> = {};
    selected.forEach((img) => {
      initialStatuses[img.index] = "pending";
    });
    setImageGenStatuses(initialStatuses);

    // Track new URLs for replacement
    const replacements: Record<number, string> = {};

    // Generate in parallel (max 3 concurrent)
    const CONCURRENCY = 3;
    let i = 0;

    async function processNext(): Promise<void> {
      while (i < selected.length) {
        const img = selected[i++];
        if (!img) break;

        setImageGenStatuses((prev) => ({ ...prev, [img.index]: "generating" }));

        try {
          const res = await fetch("/api/builder/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageSrc: img.src,
              surroundingText: img.surroundingText,
              productId,
              aspectRatio: computeAspectRatio(img.width, img.height),
              pageId,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Generation failed");
          }

          const { imageUrl } = await res.json();
          replacements[img.index] = imageUrl;
          setImageGenStatuses((prev) => ({ ...prev, [img.index]: "done" }));
        } catch {
          setImageGenStatuses((prev) => ({ ...prev, [img.index]: "error" }));
        }
      }
    }

    // Run concurrent workers
    const workers = Array.from({ length: Math.min(CONCURRENCY, selected.length) }, () =>
      processNext()
    );
    await Promise.all(workers);

    // Replace image URLs in HTML
    let updatedHtml = rewrittenHtml;
    const parser = new DOMParser();
    const doc = parser.parseFromString(updatedHtml, "text/html");
    const imgs = doc.querySelectorAll("img");

    for (const [indexStr, newUrl] of Object.entries(replacements)) {
      const idx = parseInt(indexStr, 10);
      const img = imgs[idx];
      if (img) {
        img.setAttribute("src", newUrl);
        img.removeAttribute("srcset");
      }
    }

    updatedHtml = doc.documentElement.outerHTML;
    await saveAndRefresh(updatedHtml);
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
    const order: Substep[] = ["fetching", "rewriting", "restoring", "image_selection", "generating_images", "done"];
    const currentIdx = order.indexOf(substep);
    const stepIdx = order.indexOf(stepKey);

    if (substep === "error") {
      if (stepIdx < currentIdx) return "done";
      return "pending";
    }

    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }

  const selectedCount = extractedImages.filter((img) => img.selected).length;
  const productLabel = product === "happysleep" ? "HappySleep" : product === "hydro13" ? "Hydro13" : "Product";

  // Image selection view
  if (substep === "image_selection") {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900">
            Generate Product Images
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Rewrite complete! Select which images to replace with {productLabel}-specific AI-generated images.
        </p>

        {/* Select all toggle */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={toggleAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {extractedImages.every((img) => img.selected) ? "Deselect all" : "Select all"}
          </button>
          <span className="text-xs text-gray-400">
            {selectedCount} of {extractedImages.length} selected
          </span>
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-3 gap-2 mb-4 max-h-[400px] overflow-y-auto">
          {extractedImages.map((img) => (
            <button
              key={img.index}
              onClick={() => toggleImage(img.index)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                img.selected
                  ? "border-violet-500 ring-1 ring-violet-300"
                  : "border-gray-200 opacity-60 hover:opacity-80"
              }`}
            >
              <img
                src={img.src}
                alt={`Image ${img.index + 1}`}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              {/* Checkbox overlay */}
              <div
                className={`absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center ${
                  img.selected
                    ? "bg-violet-600"
                    : "bg-white/80 border border-gray-300"
                }`}
              >
                {img.selected && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleGenerateImages}
            disabled={selectedCount === 0 || !productId}
            className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-lg transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Generate {selectedCount} {selectedCount === 1 ? "Image" : "Images"} for {productLabel}
          </button>
          <button
            onClick={handleSkip}
            className="w-full flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-700 text-xs font-medium py-2 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip — save without generating
          </button>
        </div>
      </div>
    );
  }

  // Image generation progress view
  if (substep === "generating_images") {
    const genEntries = Object.entries(imageGenStatuses);
    const doneCount = genEntries.filter(([, s]) => s === "done").length;
    const errorCount = genEntries.filter(([, s]) => s === "error").length;
    const totalCount = genEntries.length;

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="w-5 h-5 animate-spin text-violet-600 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900">
            Generating Images...
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {doneCount + errorCount} of {totalCount} complete
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
          <div
            className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${((doneCount + errorCount) / totalCount) * 100}%` }}
          />
        </div>

        {/* Per-image status grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {extractedImages
            .filter((img) => img.index in imageGenStatuses)
            .map((img) => {
              const status = imageGenStatuses[img.index];
              return (
                <div
                  key={img.index}
                  className="relative rounded-lg overflow-hidden border border-gray-200"
                >
                  <img
                    src={img.src}
                    alt={`Image ${img.index + 1}`}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div
                    className={`absolute inset-0 flex items-center justify-center ${
                      status === "generating"
                        ? "bg-black/40"
                        : status === "done"
                          ? "bg-emerald-600/30"
                          : status === "error"
                            ? "bg-red-600/30"
                            : "bg-black/20"
                    }`}
                  >
                    {status === "generating" && (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    )}
                    {status === "done" && (
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    )}
                    {status === "error" && (
                      <AlertCircle className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {errorCount > 0 && (
          <p className="text-xs text-amber-600">
            {errorCount} {errorCount === 1 ? "image" : "images"} failed — the original will be kept.
          </p>
        )}
      </div>
    );
  }

  // Default: polling/progress view
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
