"use client";

import { useState, useEffect, useRef, RefObject } from "react";
import {
  Image as ImageIcon,
  ArrowLeft,
  Loader2,
  X,
  ZoomIn,
  Upload,
  Undo2,
} from "lucide-react";

interface ClickedImage {
  src: string;
  index: number;
  width: number;
  height: number;
}

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  translationId: string;
  language: { value: string; label: string };
  clickedImage: ClickedImage | null;
  originalHtml: string;
  onClickedImageClear: () => void;
  onImageReplaced: () => void;
  onImageTranslating?: (translating: boolean) => void;
}

function computeAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  if (ratio > 1.6) return "16:9";
  if (ratio > 1.2) return "4:3";
  if (ratio > 0.9) return "1:1";
  if (ratio > 0.7) return "3:4";
  return "2:3";
}

function getOriginalImageSrc(html: string, index: number): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img");
  const img = imgs[index];
  return img?.getAttribute("src") || null;
}

export default function ImageTranslatePanel({
  iframeRef,
  translationId,
  language,
  clickedImage,
  originalHtml,
  onClickedImageClear,
  onImageReplaced,
  onImageTranslating,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine if the current image differs from the original English source
  const originalSrc = clickedImage ? getOriginalImageSrc(originalHtml, clickedImage.index) : null;
  const isModified = clickedImage && originalSrc && clickedImage.src !== originalSrc;

  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxSrc]);

  useEffect(() => {
    if (clickedImage) {
      setPrompt(
        `Recreate this exact image but translate all text to ${language.label}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, fonts, and composition. Only change the language of the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: HappySleep, Hydro13, Hälsobladet, OEKO-TEX, CertiPUR-US, Trustpilot, Standard 100.\n\nCULTURAL LOCALISATION (MANDATORY):\n- Replace ALL Swedish/English person names with culturally appropriate ${language.label} names.\n- Translate date expressions (like "X dagar sedan") and UI elements (Reply, Comment) to ${language.label}.\n- The result should look as if ORIGINALLY CREATED for a ${language.label} audience.\n- PRESERVE: Product images, star ratings, logos, certification badges, layout.`
      );
      setError("");
    }
  }, [clickedImage, language.label]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const prev = doc.querySelector("[data-cc-img-highlight]");
    if (prev) {
      (prev as HTMLElement).style.outline = "";
      prev.removeAttribute("data-cc-img-highlight");
    }

    if (clickedImage) {
      const imgs = doc.querySelectorAll("img");
      const img = imgs[clickedImage.index];
      if (img) {
        img.style.outline = "3px solid #818cf8";
        img.setAttribute("data-cc-img-highlight", "true");
        img.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [clickedImage, iframeRef]);

  function handleBack() {
    onClickedImageClear();
    setError("");
  }

  async function handleTranslate() {
    if (!clickedImage) return;

    const aspectRatio = computeAspectRatio(clickedImage.width, clickedImage.height);
    const imageToTranslate = { ...clickedImage };
    const currentPrompt = prompt;

    // Fire-and-forget: clear the panel immediately so user can continue editing
    onClickedImageClear();
    setError("");
    onImageTranslating?.(true);

    try {
      const res = await fetch("/api/translate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageToTranslate.src,
          prompt: currentPrompt,
          translationId,
          aspectRatio,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Image translation failed");
      }

      const { newImageUrl } = await res.json();

      // Auto-accept: swap image in iframe directly
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const imgs = doc.querySelectorAll("img");
        const img = imgs[imageToTranslate.index];
        if (img) {
          img.src = newImageUrl;
          img.removeAttribute("srcset");
          img.style.outline = "";
          img.removeAttribute("data-cc-img-highlight");
        }
      }

      onImageReplaced();
    } catch (err) {
      console.error("Background image translation failed:", err);
    } finally {
      onImageTranslating?.(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clickedImage) return;
    e.target.value = "";

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("translationId", translationId);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();

      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const imgs = doc.querySelectorAll("img");
        const img = imgs[clickedImage.index];
        if (img) {
          img.src = imageUrl;
          img.removeAttribute("srcset");
          img.style.outline = "";
          img.removeAttribute("data-cc-img-highlight");
        }
      }

      onImageReplaced();
      onClickedImageClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleRevert() {
    if (!clickedImage || !originalSrc) return;

    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const imgs = doc.querySelectorAll("img");
      const img = imgs[clickedImage.index];
      if (img) {
        img.src = originalSrc;
        img.removeAttribute("srcset");
        img.style.outline = "";
        img.removeAttribute("data-cc-img-highlight");
      }
    }

    onImageReplaced();
    onClickedImageClear();
  }

  if (!clickedImage) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Images
        </p>
        <p className="text-xs text-gray-400">
          Click an image in the preview to translate or replace it.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Translate Image
        </p>
      </div>

      <button
        type="button"
        onClick={() => setLightboxSrc(clickedImage.src)}
        className="group relative rounded-lg overflow-hidden border border-gray-200 w-full cursor-zoom-in"
      >
        <img src={clickedImage.src} alt="Selected image" className="w-full h-auto" />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </button>

      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 uppercase tracking-wider">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleTranslate}
        disabled={uploading || !prompt.trim()}
        className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
      >
        <ImageIcon className="w-3.5 h-3.5" />
        Translate Image
      </button>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
      >
        {uploading ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
        ) : (
          <><Upload className="w-3.5 h-3.5" /> Upload Image</>
        )}
      </button>

      {isModified && (
        <button
          onClick={handleRevert}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-amber-50 disabled:opacity-50 text-amber-700 text-xs font-medium py-2.5 rounded-lg border border-amber-200 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Revert to original
        </button>
      )}

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            aria-label="Close enlarged image"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxSrc}
            alt="Enlarged view"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
