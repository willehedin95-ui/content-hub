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
  Play,
  Film,
  ImageIcon,
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
  index: number; // index among all <img> or <video> tags in the HTML
  width: number;
  height: number;
  surroundingText: string;
  selected: boolean;
  mediaType: "image" | "video";
  videoSrc?: string; // original video URL (for thumbnail generation)
  thumbnail?: string; // data URL of first frame
  generateAsVideo?: boolean; // for video items: generate replacement video (true) or static image (false)
}

type ImageGenStatus = "pending" | "generating" | "done" | "error" | "keyframe" | "video_polling";

/** Parse display dimensions from an element's attributes and inline styles */
function parseDisplayDimensions(el: Element): { width: number; height: number } {
  const attrW = parseInt(el.getAttribute("width") || "0", 10);
  const attrH = parseInt(el.getAttribute("height") || "0", 10);
  const style = el.getAttribute("style") || "";

  // Check for aspect-ratio in inline style (e.g. "aspect-ratio: 1/1" or "aspect-ratio: 1")
  const arMatch = style.match(/aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/);
  if (arMatch) {
    const arW = parseFloat(arMatch[1]);
    const arH = arMatch[2] ? parseFloat(arMatch[2]) : arW; // "1" means "1/1"
    // Use attribute width if available, otherwise estimate
    const baseSize = attrW || 400;
    return { width: baseSize, height: Math.round(baseSize * (arH / arW)) };
  }

  // Check parent and grandparent for aspect-ratio too
  for (const parent of [el.parentElement, el.parentElement?.parentElement]) {
    if (!parent) continue;
    const parentStyle = parent.getAttribute("style") || "";
    const parentAr = parentStyle.match(/aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/);
    if (parentAr) {
      const arW = parseFloat(parentAr[1]);
      const arH = parentAr[2] ? parseFloat(parentAr[2]) : arW;
      const baseSize = attrW || 400;
      return { width: baseSize, height: Math.round(baseSize * (arH / arW)) };
    }
  }

  // Parse width/height from inline style
  const styleW = style.match(/(?:^|;)\s*width\s*:\s*(\d+)px/);
  const styleH = style.match(/(?:^|;)\s*height\s*:\s*(\d+)px/);
  const w = (styleW ? parseInt(styleW[1], 10) : 0) || attrW;
  const h = (styleH ? parseInt(styleH[1], 10) : 0) || attrH;

  return { width: w, height: h };
}

/** Normalize URL for deduplication — strip query params, hash, and resize suffixes */
function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    // Strip query params and hash
    let path = u.origin + u.pathname;
    // Strip common resize suffixes like -300x200, _thumb, etc.
    path = path.replace(/-\d+x\d+(?=\.\w+$)/, "");
    return path.toLowerCase();
  } catch {
    // If not a valid URL, just strip query string
    return url.split("?")[0].split("#")[0].toLowerCase();
  }
}

/** Extract images and videos from HTML, filter out icons/tiny images, deduplicate by src */
function extractMedia(html: string): ExtractedImage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Strip <noscript> elements — they contain fallback duplicates of lazy-loaded images
  doc.querySelectorAll("noscript").forEach((el) => el.remove());

  const results: ExtractedImage[] = [];
  const seenSrcs = new Set<string>();

  // Extract images
  const imgs = doc.querySelectorAll("img");
  imgs.forEach((img, index) => {
    let src = img.getAttribute("src") || "";
    // Use data-src fallback for lazy-loaded images with placeholder src
    if ((!src || src.startsWith("data:")) && img.getAttribute("data-src")) {
      src = img.getAttribute("data-src")!;
    }
    if (!src || src.startsWith("data:")) return;

    const normalized = normalizeUrlForDedup(src);
    if (seenSrcs.has(normalized)) return;
    seenSrcs.add(normalized);

    const dims = parseDisplayDimensions(img);
    const w = dims.width;
    const h = dims.height;
    if ((w > 0 && w < MIN_IMAGE_DIMENSION) || (h > 0 && h < MIN_IMAGE_DIMENSION)) return;

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

    const surroundingText = getSurroundingTextFromDom(img);

    results.push({
      src,
      index,
      width: w || 400,
      height: h || 400,
      surroundingText,
      selected: true,
      mediaType: "image",
    });
  });

  // Extract videos
  const videos = doc.querySelectorAll("video");
  videos.forEach((video, index) => {
    const src = video.getAttribute("src")
      || video.querySelector("source")?.getAttribute("src")
      || "";
    if (!src) return;

    const normalizedVid = normalizeUrlForDedup(src);
    if (seenSrcs.has(normalizedVid)) return;
    seenSrcs.add(normalizedVid);

    const poster = video.getAttribute("poster") || "";
    const dims = parseDisplayDimensions(video);
    const surroundingText = getSurroundingTextFromDom(video);

    results.push({
      src: poster || src, // use poster for thumbnail display, fallback to video src
      videoSrc: src, // always keep the actual video URL
      index,
      width: dims.width || 640,
      height: dims.height || 360,
      surroundingText,
      selected: true,
      mediaType: "video",
      generateAsVideo: false, // default: generate static image (faster); user can toggle to video
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

/** Load a video URL in a hidden element and capture the first frame as a data URL */
function captureVideoThumbnail(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
    }

    video.onloadeddata = () => {
      // Seek to 0.5s for a more representative frame (avoids black frames)
      video.currentTime = Math.min(0.5, video.duration || 0.5);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve(dataUrl);
      } catch {
        // CORS or other canvas errors
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = videoUrl;
  });
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

  // Generate thumbnails for videos that don't have a poster
  useEffect(() => {
    const videos = extractedImages.filter(
      (img) => img.mediaType === "video" && !img.thumbnail && img.videoSrc
    );
    if (videos.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const vid of videos) {
        if (cancelled) break;
        const thumb = await captureVideoThumbnail(vid.videoSrc!);
        if (cancelled) break;
        if (thumb) {
          setExtractedImages((prev) =>
            prev.map((img) =>
              img.mediaType === "video" && img.index === vid.index
                ? { ...img, thumbnail: thumb }
                : img
            )
          );
        }
      }
    })();

    return () => { cancelled = true; };
  }, [extractedImages.length]); // only re-run when new items are added

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
      const images = extractMedia(html);
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

  function toggleVideoMode(index: number) {
    setExtractedImages((prev) =>
      prev.map((img) =>
        img.index === index && img.mediaType === "video"
          ? { ...img, generateAsVideo: !img.generateAsVideo }
          : img
      )
    );
  }

  /** Poll Kling video task until complete or failed */
  async function pollVideoTask(taskId: string, product: string): Promise<string | null> {
    const maxAttempts = 60; // 5 min at 5s intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(
          `/api/video-swiper/status?tasks=${taskId}&product=${product}`
        );
        if (!res.ok) continue;
        const data = await res.json();
        const task = data.tasks?.[0];
        if (!task) continue;
        if (task.status === "completed" && task.video_url) return task.video_url;
        if (task.status === "failed") return null;
      } catch {
        // continue polling
      }
    }
    return null;
  }

  /** Generate replacement images/videos for selected items */
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

    // Track new URLs for replacement: { index: { url, type } }
    const replacements: Record<number, { url: string; asVideo: boolean }> = {};

    // Split: images + videos-as-image first (parallel), then videos-as-video (sequential, slow)
    const imageItems = selected.filter(
      (img) => img.mediaType === "image" || !img.generateAsVideo
    );
    const videoItems = selected.filter(
      (img) => img.mediaType === "video" && img.generateAsVideo
    );

    // --- Phase 1: Generate images (parallel, max 3 concurrent) ---
    const CONCURRENCY = 3;
    let idx = 0;

    async function processImageNext(): Promise<void> {
      while (idx < imageItems.length) {
        const img = imageItems[idx++];
        if (!img) break;

        setImageGenStatuses((prev) => ({ ...prev, [img.index]: "generating" }));

        try {
          const isVideo = img.mediaType === "video";
          const hasPoster = isVideo && img.src && !img.src.includes(".mp4") && !img.src.includes(".webm") && !img.src.includes(".mov");

          const res = await fetch("/api/builder/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...((!isVideo || hasPoster) && { imageSrc: img.src }),
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
          replacements[img.index] = { url: imageUrl, asVideo: false };
          setImageGenStatuses((prev) => ({ ...prev, [img.index]: "done" }));
        } catch {
          setImageGenStatuses((prev) => ({ ...prev, [img.index]: "error" }));
        }
      }
    }

    const imageWorkers = Array.from(
      { length: Math.min(CONCURRENCY, imageItems.length) },
      () => processImageNext()
    );
    await Promise.all(imageWorkers);

    // --- Phase 2: Generate videos (one at a time — each takes ~2 min) ---
    for (const vid of videoItems) {
      setImageGenStatuses((prev) => ({ ...prev, [vid.index]: "keyframe" }));

      try {
        // Step 1: Start video generation (keyframe + Kling)
        const res = await fetch("/api/builder/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surroundingText: vid.surroundingText,
            productId,
            aspectRatio: computeAspectRatio(vid.width, vid.height),
            pageId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Video generation failed");
        }

        const { taskId } = await res.json();

        // Step 2: Poll Kling for completion
        setImageGenStatuses((prev) => ({ ...prev, [vid.index]: "video_polling" }));

        const videoUrl = await pollVideoTask(taskId, product || "happysleep");
        if (videoUrl) {
          replacements[vid.index] = { url: videoUrl, asVideo: true };
          setImageGenStatuses((prev) => ({ ...prev, [vid.index]: "done" }));
        } else {
          setImageGenStatuses((prev) => ({ ...prev, [vid.index]: "error" }));
        }
      } catch {
        setImageGenStatuses((prev) => ({ ...prev, [vid.index]: "error" }));
      }
    }

    // --- Replace media in HTML ---
    const parser = new DOMParser();
    const doc = parser.parseFromString(rewrittenHtml, "text/html");

    // Strip <noscript> elements (same as extraction step) so indices match
    doc.querySelectorAll("noscript").forEach((el) => el.remove());

    const imageReplacements = new Map<string, string>();
    const videoToImageReplacements = new Map<number, string>();
    const videoToVideoReplacements = new Map<number, string>();

    const allImgs = doc.querySelectorAll("img");
    const allVideos = doc.querySelectorAll("video");

    for (const [indexStr, { url, asVideo }] of Object.entries(replacements)) {
      const i = parseInt(indexStr, 10);
      const item = selected.find((s) => s.index === i);
      if (!item) continue;

      if (item.mediaType === "video") {
        if (asVideo) {
          videoToVideoReplacements.set(i, url);
        } else {
          videoToImageReplacements.set(i, url);
        }
      } else {
        const origSrc = allImgs[i]?.getAttribute("src");
        if (origSrc) imageReplacements.set(origSrc, url);
      }
    }

    // Replace ALL img tags that share the same src
    allImgs.forEach((img) => {
      const src = img.getAttribute("src") || "";
      const newUrl = imageReplacements.get(src);
      if (newUrl) {
        img.setAttribute("src", newUrl);
        img.removeAttribute("srcset");
      }
    });

    // Replace video → img (for videos generated as static images)
    videoToImageReplacements.forEach((newUrl, vidIdx) => {
      const video = allVideos[vidIdx];
      if (video && video.parentElement) {
        const img = doc.createElement("img");
        img.setAttribute("src", newUrl);
        img.style.width = video.style.width || "100%";
        img.style.maxWidth = video.style.maxWidth || "";
        img.style.display = "block";
        video.parentElement.replaceChild(img, video);
      }
    });

    // Replace video src (for videos generated as actual videos)
    videoToVideoReplacements.forEach((newUrl, vidIdx) => {
      const video = allVideos[vidIdx];
      if (video) {
        video.setAttribute("src", newUrl);
        video.removeAttribute("poster");
        // Remove <source> children too
        video.querySelectorAll("source").forEach((s) => s.remove());
      }
    });

    const updatedHtml = doc.documentElement.outerHTML;
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
          Rewrite complete! Select which {extractedImages.some((i) => i.mediaType === "video") ? "images and videos" : "images"} to replace with {productLabel}-specific AI-generated content.
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

        {/* Media grid */}
        <div className="grid grid-cols-3 gap-2 mb-4 max-h-[400px] overflow-y-auto">
          {extractedImages.map((img) => (
            <button
              key={`${img.mediaType}-${img.index}`}
              onClick={() => toggleImage(img.index)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                img.selected
                  ? "border-violet-500 ring-1 ring-violet-300"
                  : "border-gray-200 opacity-60 hover:opacity-80"
              }`}
            >
              {img.mediaType === "video" ? (
                <div className="w-full aspect-square bg-gray-800 flex items-center justify-center relative">
                  {img.thumbnail ? (
                    <img src={img.thumbnail} alt="Video frame" className="w-full h-full object-cover" />
                  ) : img.src && !img.src.includes(".mp4") && !img.src.includes(".webm") && !img.src.includes(".mov") ? (
                    <img src={img.src} alt="Video poster" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <>
                      <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                      <span className="text-[10px] text-gray-500 absolute bottom-8">Loading preview...</span>
                    </>
                  )}
                </div>
              ) : (
                <img
                  src={img.src}
                  alt={`Image ${img.index + 1}`}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              )}
              {/* Video mode toggle */}
              {img.mediaType === "video" && img.selected && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleVideoMode(img.index); }}
                  className="absolute bottom-1.5 left-1.5 bg-black/80 hover:bg-black/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                  title={img.generateAsVideo ? "Click to generate as static image instead" : "Click to generate as video"}
                >
                  {img.generateAsVideo ? (
                    <><Film className="w-2.5 h-2.5" /> VIDEO</>
                  ) : (
                    <><ImageIcon className="w-2.5 h-2.5" /> IMAGE</>
                  )}
                </button>
              )}
              {img.mediaType === "video" && !img.selected && (
                <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Play className="w-2.5 h-2.5" />
                  VIDEO
                </div>
              )}
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
            Generate {selectedCount} {selectedCount === 1 ? "item" : "items"} for {productLabel}
            {extractedImages.some((i) => i.selected && i.generateAsVideo) && (
              <span className="text-violet-200 font-normal ml-1">
                (incl. {extractedImages.filter((i) => i.selected && i.generateAsVideo).length} video{extractedImages.filter((i) => i.selected && i.generateAsVideo).length > 1 ? "s" : ""})
              </span>
            )}
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
    const hasVideos = genEntries.some(([, s]) => s === "keyframe" || s === "video_polling");
    const allDone = doneCount + errorCount === totalCount;

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          {allDone ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-violet-600 shrink-0" />
          )}
          <h2 className="text-sm font-semibold text-gray-900">
            {allDone ? "Generation Complete" : "Generating..."}
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {doneCount + errorCount} of {totalCount} complete
          {hasVideos && <span className="text-gray-400"> — videos take 1-3 min each</span>}
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
                  key={`${img.mediaType}-${img.index}`}
                  className="relative rounded-lg overflow-hidden border border-gray-200"
                >
                  {img.thumbnail || img.mediaType !== "video" ? (
                    <img
                      src={img.thumbnail || img.src}
                      alt={`${img.mediaType === "video" ? "Video" : "Image"} ${img.index + 1}`}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-800 flex items-center justify-center">
                      <Play className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center ${
                      status === "generating" || status === "keyframe"
                        ? "bg-black/40"
                        : status === "video_polling"
                          ? "bg-indigo-600/30"
                          : status === "done"
                            ? "bg-emerald-600/30"
                            : status === "error"
                              ? "bg-red-600/30"
                              : "bg-black/20"
                    }`}
                  >
                    {(status === "generating" || status === "keyframe") && (
                      <>
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                        {status === "keyframe" && (
                          <span className="text-[9px] text-white mt-1">Keyframe...</span>
                        )}
                      </>
                    )}
                    {status === "video_polling" && (
                      <>
                        <Film className="w-5 h-5 text-white" />
                        <Loader2 className="w-4 h-4 text-white animate-spin mt-1" />
                        <span className="text-[9px] text-white mt-0.5">Generating video...</span>
                      </>
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
