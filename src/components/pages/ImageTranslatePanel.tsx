"use client";

import { useState, useEffect, RefObject } from "react";
import {
  Image as ImageIcon,
  ArrowLeft,
  Loader2,
  Check,
  X,
} from "lucide-react";

interface PageImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  aspectRatio: string;
  index: number; // position in the DOM for re-finding after iframe reload
}

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  translationId: string;
  language: { value: string; label: string };
  onImageReplaced: () => void;
}

function computeAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  if (ratio > 1.6) return "16:9";
  if (ratio > 1.2) return "4:3";
  if (ratio > 0.9) return "1:1";
  if (ratio > 0.7) return "3:4";
  return "2:3";
}

export default function ImageTranslatePanel({
  iframeRef,
  translationId,
  language,
  onImageReplaced,
}: Props) {
  const [images, setImages] = useState<PageImage[]>([]);
  const [selected, setSelected] = useState<PageImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "preview" | "error"
  >("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Extract images from iframe on load
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function extractImages() {
      const doc = iframe!.contentDocument;
      if (!doc) return;
      const imgs = Array.from(doc.querySelectorAll("img"));
      const filtered: PageImage[] = [];
      imgs.forEach((img, i) => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 50 || h < 50) return;
        if (img.src.startsWith("data:")) return;
        if (img.src.endsWith(".svg")) return;
        filtered.push({
          src: img.src,
          alt: img.alt || "",
          width: w,
          height: h,
          aspectRatio: computeAspectRatio(w, h),
          index: i,
        });
      });
      setImages(filtered);
    }

    iframe.addEventListener("load", extractImages);
    // Try immediately in case already loaded
    if (iframe.contentDocument?.readyState === "complete") {
      extractImages();
    }
    return () => iframe.removeEventListener("load", extractImages);
  }, [iframeRef]);

  // Elapsed timer during generation
  useEffect(() => {
    if (status !== "loading") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Highlight selected image in iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    // Clear previous highlight
    const prev = doc.querySelector("[data-cc-img-highlight]");
    if (prev) {
      (prev as HTMLElement).style.outline = "";
      prev.removeAttribute("data-cc-img-highlight");
    }

    // Add new highlight
    if (selected) {
      const imgs = doc.querySelectorAll("img");
      const img = imgs[selected.index];
      if (img) {
        img.style.outline = "3px solid #818cf8";
        img.setAttribute("data-cc-img-highlight", "true");
        img.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selected, iframeRef]);

  function handleSelect(img: PageImage) {
    setSelected(img);
    setPrompt(
      `Recreate this exact image but translate all English text to ${language.label}. Keep the same visual style, layout, colors, fonts, and composition. Only change the language of the text.`
    );
    setStatus("idle");
    setResultUrl(null);
    setError("");
  }

  function handleBack() {
    setSelected(null);
    setStatus("idle");
    setResultUrl(null);
    setError("");
  }

  async function handleTranslate() {
    if (!selected) return;
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/translate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: selected.src,
          prompt,
          translationId,
          aspectRatio: selected.aspectRatio,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Image translation failed");
      }

      const { newImageUrl } = await res.json();
      setResultUrl(newImageUrl);
      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setStatus("error");
    }
  }

  function handleAccept() {
    if (!selected || !resultUrl) return;

    // Replace image src in the iframe DOM
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const imgs = doc.querySelectorAll("img");
      const img = imgs[selected.index];
      if (img) {
        img.src = resultUrl;
        img.removeAttribute("srcset");
        img.style.outline = "";
        img.removeAttribute("data-cc-img-highlight");
      }
    }

    onImageReplaced();

    // Update the image list entry with the new src
    setImages((prev) =>
      prev.map((img) =>
        img.index === selected.index ? { ...img, src: resultUrl } : img
      )
    );
    setSelected(null);
    setStatus("idle");
    setResultUrl(null);
  }

  function handleReject() {
    setStatus("idle");
    setResultUrl(null);
  }

  // No images found
  if (images.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Images
        </p>
        <p className="text-xs text-slate-600">
          No translatable images found on this page.
        </p>
      </div>
    );
  }

  // Selected image view
  if (selected) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            disabled={status === "loading"}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Translate Image
          </p>
        </div>

        {/* Original image */}
        <div className="rounded-lg overflow-hidden border border-[#1e2130]">
          <img
            src={selected.src}
            alt={selected.alt}
            className="w-full h-auto"
          />
        </div>

        {/* Result preview */}
        {status === "preview" && resultUrl && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              Generated Result
            </p>
            <div className="rounded-lg overflow-hidden border border-indigo-500/50">
              <img src={resultUrl} alt="Translated" className="w-full h-auto" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 rounded-lg transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Accept
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#141620] hover:bg-[#1e2130] text-slate-300 text-xs font-medium py-2 rounded-lg border border-[#1e2130] transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        )}

        {/* Prompt */}
        {status !== "preview" && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={status === "loading"}
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <button
              onClick={handleTranslate}
              disabled={status === "loading" || !prompt.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating... {elapsed > 0 && `(${elapsed}s)`}
                </>
              ) : (
                <>
                  <ImageIcon className="w-3.5 h-3.5" />
                  Translate Image
                </>
              )}
            </button>
          </>
        )}
      </div>
    );
  }

  // Image list view
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Images ({images.length})
      </p>
      <p className="text-[10px] text-slate-600">
        Click an image to translate its text
      </p>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img) => (
          <button
            key={img.index}
            onClick={() => handleSelect(img)}
            className="rounded-lg overflow-hidden border border-[#1e2130] hover:border-indigo-500/50 transition-colors"
          >
            <img
              src={img.src}
              alt={img.alt}
              className="w-full h-20 object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
