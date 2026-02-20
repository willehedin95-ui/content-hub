"use client";

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  Image as ImageIcon,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";

interface PageImage {
  src: string;
  index: number;
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  translationId: string;
  language: { value: string; label: string };
  pageHtml: string;
  onClose: (translated: boolean) => void;
}

function extractImagesFromHtml(html: string): PageImage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img");
  const results: PageImage[] = [];

  imgs.forEach((img, index) => {
    const src = img.getAttribute("src");
    if (!src) return;
    // Skip tiny images (icons, spacers, tracking pixels)
    const w = parseInt(img.getAttribute("width") || "0");
    const h = parseInt(img.getAttribute("height") || "0");
    // Skip data URIs and very small known dimensions
    if (src.startsWith("data:")) return;
    if (w > 0 && h > 0 && w < 50 && h < 50) return;
    results.push({ src, index, width: w, height: h });
  });

  return results;
}

export default function ImageSelectionModal({
  open,
  translationId,
  language,
  pageHtml,
  onClose,
}: Props) {
  const [images, setImages] = useState<PageImage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [anyTranslated, setAnyTranslated] = useState(false);

  useEffect(() => {
    if (open && pageHtml) {
      const extracted = extractImagesFromHtml(pageHtml);
      setImages(extracted);
      setSelected(new Set());
      setTranslating(false);
      setProgress({ done: 0, total: 0 });
      setErrors([]);
      setAnyTranslated(false);
    }
  }, [open, pageHtml]);

  function toggleImage(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === images.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(images.map((_, i) => i)));
    }
  }

  function computeAspectRatio(w: number, h: number): string {
    if (w === 0 || h === 0) return "1:1";
    const ratio = w / h;
    if (ratio > 1.6) return "16:9";
    if (ratio > 1.2) return "4:3";
    if (ratio > 0.9) return "1:1";
    if (ratio > 0.7) return "3:4";
    return "2:3";
  }

  async function handleTranslate() {
    const selectedImages = images.filter((_, i) => selected.has(i));
    if (selectedImages.length === 0) return;

    setTranslating(true);
    setProgress({ done: 0, total: selectedImages.length });
    setErrors([]);

    // Process images sequentially to avoid overwhelming the API
    for (const img of selectedImages) {
      try {
        const aspectRatio = computeAspectRatio(img.width, img.height);

        const res = await fetch("/api/translate-page-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationId,
            imageUrl: img.src,
            imageIndex: img.index,
            language: language.value,
            aspectRatio,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setErrors((prev) => [...prev, data.error || `Image ${img.index + 1} failed`]);
        } else {
          setAnyTranslated(true);
        }
      } catch {
        setErrors((prev) => [...prev, `Image ${img.index + 1}: network error`]);
      }
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setTranslating(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Translate Images to {language.label}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Select images that contain text to translate
            </p>
          </div>
          <button
            onClick={() => onClose(anyTranslated)}
            disabled={translating}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {images.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No images found on this page</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={toggleAll}
                  disabled={translating}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 disabled:opacity-50 transition-colors"
                >
                  {selected.size === images.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selected.size === images.length ? "Deselect all" : "Select all"}
                </button>
                <span className="text-xs text-gray-400">
                  {selected.size} of {images.length} selected
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => !translating && toggleImage(i)}
                    disabled={translating}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      selected.has(i)
                        ? "border-indigo-500 ring-2 ring-indigo-200"
                        : "border-gray-200 hover:border-gray-300"
                    } ${translating ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <img
                      src={img.src}
                      alt={`Page image ${i + 1}`}
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                    <div
                      className={`absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        selected.has(i)
                          ? "bg-indigo-500 text-white"
                          : "bg-white/80 border border-gray-300 text-transparent"
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-200 shrink-0">
            {errors.map((err, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {err}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 shrink-0">
          <button
            onClick={() => onClose(anyTranslated)}
            disabled={translating}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            {anyTranslated ? "Done" : "Skip"}
          </button>

          {translating ? (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Translating {progress.done}/{progress.total} images...
            </div>
          ) : (
            <button
              onClick={handleTranslate}
              disabled={selected.size === 0 || images.length === 0}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              Translate {selected.size > 0 ? `(${selected.size})` : "Selected"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
