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
  Wand2,
  Check,
  ImagePlus,
  Sparkles,
} from "lucide-react";
import type { ProductImage, Asset } from "@/types";

interface ClickedImage {
  src: string;
  index: number;
  width: number;
  height: number;
  surroundingText?: string;
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
  isSource?: boolean;
  pageProduct?: string;
}

type Mode = "translate" | "replace";

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

export default function ImagePanel({
  iframeRef,
  translationId,
  language,
  clickedImage,
  originalHtml,
  onClickedImageClear,
  onImageReplaced,
  onImageTranslating,
  isSource,
  pageProduct,
}: Props) {
  const [mode, setMode] = useState<Mode>(isSource ? "replace" : "translate");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [smartGenerating, setSmartGenerating] = useState(false);
  const [smartPhase, setSmartPhase] = useState<"analyzing" | "generating">("analyzing");
  const [forceProduct, setForceProduct] = useState(false);
  const [pickingFromBank, setPickingFromBank] = useState(false);
  const [pickingFromAssets, setPickingFromAssets] = useState(false);
  const [assetBankData, setAssetBankData] = useState<Asset[]>([]);
  const assetsFetchedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Product bank data (fetched client-side)
  const [productData, setProductData] = useState<{
    id: string;
    images: ProductImage[];
  } | null>(null);
  const productFetchedRef = useRef(false);

  // Determine if the current image differs from the original English source
  const originalSrc = clickedImage
    ? getOriginalImageSrc(originalHtml, clickedImage.index)
    : null;
  const isModified =
    clickedImage && originalSrc && clickedImage.src !== originalSrc;

  // Fetch product data for product bank + AI replace
  useEffect(() => {
    if (!pageProduct || productFetchedRef.current) return;
    productFetchedRef.current = true;

    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Array<{ id: string; slug: string; product_images?: ProductImage[] }>) => {
        const match = products.find((p) => p.slug === pageProduct);
        if (match) {
          setProductData({
            id: match.id,
            images: match.product_images ?? [],
          });
        }
      })
      .catch(() => {});
  }, [pageProduct]);

  // Fetch asset bank data
  useEffect(() => {
    if (assetsFetchedRef.current) return;
    assetsFetchedRef.current = true;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Asset[]) => setAssetBankData(data))
      .catch(() => {});
  }, []);

  // Lightbox escape key
  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxSrc]);

  // Pre-fill prompt when image or mode changes
  useEffect(() => {
    if (!clickedImage) return;
    setError("");
    if (mode === "translate") {
      setPrompt(
        `Recreate this exact image but translate all text to ${language.label}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, fonts, and composition. Only change the language of the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: HappySleep, Hydro13, Hälsobladet, OEKO-TEX, CertiPUR-US, Trustpilot, Standard 100.\n\nCULTURAL LOCALISATION (MANDATORY):\n- Replace ALL Swedish/English person names with culturally appropriate ${language.label} names.\n- Translate date expressions (like "X dagar sedan") and UI elements (Reply, Comment) to ${language.label}.\n- The result should look as if ORIGINALLY CREATED for a ${language.label} audience.\n- PRESERVE: Product images, star ratings, logos, certification badges, layout.`
      );
    } else {
      setPrompt("");
    }
  }, [clickedImage, mode, language.label]);

  // Highlight clicked image in iframe
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
    setAnalyzing(false);
  }

  /** Swap an image in the iframe */
  function swapImageInIframe(imageIndex: number, newUrl: string) {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const imgs = doc.querySelectorAll("img");
      const img = imgs[imageIndex];
      if (img) {
        img.src = newUrl;
        img.removeAttribute("srcset");
        img.style.outline = "";
        img.removeAttribute("data-cc-img-highlight");
      }
    }
    onImageReplaced();
  }

  /** Translate image via Kie AI — keeps panel open during generation */
  async function handleTranslate() {
    if (!clickedImage) return;

    const aspectRatio = computeAspectRatio(
      clickedImage.width,
      clickedImage.height
    );
    const imageToProcess = { ...clickedImage };
    const currentPrompt = prompt;

    setError("");
    setGenerating(true);
    onImageTranslating?.(true);

    try {
      const res = await fetch("/api/translate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageToProcess.src,
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
      swapImageInIframe(imageToProcess.index, newImageUrl);
      onClickedImageClear();
    } catch (err) {
      console.error("Background image translation failed:", err);
      setError(err instanceof Error ? err.message : "Image translation failed");
    } finally {
      setGenerating(false);
      onImageTranslating?.(false);
    }
  }

  /** AI Analyze: use GPT-4o vision to generate a replacement prompt */
  async function handleAnalyze() {
    if (!clickedImage || !productData) return;
    setAnalyzing(true);
    setError("");

    try {
      const res = await fetch("/api/swipe/analyze-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [{ src: clickedImage.src, alt: "" }],
          productId: productData.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const { analyses, failures } = (await res.json()) as {
        analyses: Array<{
          src: string;
          nanoBananaPrompt: string;
          referenceImages: string[];
        }>;
        failures?: Array<{ src: string; error: string }>;
      };

      if (analyses.length > 0) {
        setPrompt(analyses[0].nanoBananaPrompt);
      } else if (failures?.length) {
        setError(failures[0].error || "Analysis failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  /** One-click: analyze context + generate replacement in one call */
  async function handleSmartGenerate() {
    if (!clickedImage || !productData) return;

    const imageToProcess = { ...clickedImage };

    setError("");
    setSmartGenerating(true);
    setSmartPhase("analyzing");
    onImageTranslating?.(true);

    try {
      const phaseTimer = setTimeout(() => setSmartPhase("generating"), 8000);

      const res = await fetch("/api/builder/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSrc: imageToProcess.src,
          surroundingText: imageToProcess.surroundingText || "",
          productId: productData.id,
          aspectRatio: computeAspectRatio(imageToProcess.width, imageToProcess.height),
          forceProduct,
        }),
      });

      clearTimeout(phaseTimer);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { imageUrl, prompt: usedPrompt } = await res.json();
      setPrompt(usedPrompt);
      swapImageInIframe(imageToProcess.index, imageUrl);
      onClickedImageClear();
    } catch (err) {
      console.error("Smart image generation failed:", err);
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setSmartGenerating(false);
      onImageTranslating?.(false);
    }
  }

  /** Generate replacement image via Kie AI — keeps panel open during generation */
  async function handleReplace() {
    if (!clickedImage || !prompt.trim()) return;

    const imageToProcess = { ...clickedImage };
    const currentPrompt = prompt;
    const referenceImages = (productData?.images ?? [])
      .filter((img) => img.category === "hero" || img.category === "detail")
      .map((img) => img.url);

    setError("");
    setGenerating(true);
    onImageTranslating?.(true);

    try {
      const res = await fetch("/api/swipe/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          referenceImages,
          originalSrc: imageToProcess.src,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { generatedUrl } = await res.json();
      swapImageInIframe(imageToProcess.index, generatedUrl);
      onClickedImageClear();
    } catch (err) {
      console.error("Background image replacement failed:", err);
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGenerating(false);
      onImageTranslating?.(false);
    }
  }

  /** Pick from product bank */
  function handleBankPick(newUrl: string) {
    if (!clickedImage) return;
    setPickingFromBank(false);
    swapImageInIframe(clickedImage.index, newUrl);
    onClickedImageClear();
  }

  /** Upload custom image */
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
      swapImageInIframe(clickedImage.index, imageUrl);
      onClickedImageClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Revert to original */
  function handleRevert() {
    if (!clickedImage || !originalSrc) return;
    swapImageInIframe(clickedImage.index, originalSrc);
    onClickedImageClear();
  }

  // No image selected — show hint
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

  /** Pick from asset bank */
  function handleAssetPick(newUrl: string) {
    if (!clickedImage) return;
    setPickingFromAssets(false);
    swapImageInIframe(clickedImage.index, newUrl);
    onClickedImageClear();
  }

  const canTranslate = !isSource;
  const hasProductBank = (productData?.images.length ?? 0) > 0;
  const hasAssetBank = assetBankData.length > 0;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Edit Image
        </p>
      </div>

      {/* Image preview */}
      <button
        type="button"
        onClick={() => setLightboxSrc(clickedImage.src)}
        className="group relative rounded-lg overflow-hidden border border-gray-200 w-full cursor-zoom-in"
      >
        <img
          src={clickedImage.src}
          alt="Selected image"
          className="w-full h-auto"
        />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </button>

      {/* Mode tabs */}
      {canTranslate && (
        <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setMode("translate")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === "translate"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Translate
          </button>
          <button
            onClick={() => setMode("replace")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === "replace"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Replace
          </button>
        </div>
      )}

      {/* Smart one-click generate (only in replace mode or source editor) */}
      {(mode === "replace" || isSource) && productData && (
        <>
          <button
            onClick={handleSmartGenerate}
            disabled={uploading || generating || analyzing || smartGenerating}
            className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-semibold py-3 rounded-lg transition-all shadow-sm"
          >
            {smartGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {smartPhase === "analyzing" ? "Analyzing image..." : "Generating replacement..."}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Generate for {pageProduct === "happysleep" ? "HappySleep" : pageProduct === "hydro13" ? "Hydro13" : "Product"}
              </>
            )}
          </button>

          {/* Force product toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={forceProduct}
              onClick={() => setForceProduct((v) => !v)}
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                forceProduct ? "bg-violet-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                  forceProduct ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-[11px] text-gray-500">
              Include {pageProduct === "happysleep" ? "HappySleep pillow" : pageProduct === "hydro13" ? "Hydro13" : "product"} in image
            </span>
          </label>

          <div className="flex items-center gap-2 text-[10px] text-gray-300 uppercase tracking-wider">
            <div className="flex-1 border-t border-gray-200" />
            or edit manually
            <div className="flex-1 border-t border-gray-200" />
          </div>
        </>
      )}

      {/* Prompt area */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 uppercase tracking-wider">
            Prompt
          </label>
          {mode === "replace" && productData && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing || smartGenerating}
              className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              {analyzing ? "Analyzing..." : "AI Analyze"}
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={mode === "translate" ? 5 : 4}
          placeholder={
            mode === "replace"
              ? "Describe the replacement image, or click AI Analyze..."
              : undefined
          }
          className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Primary action */}
      {mode === "translate" ? (
        <button
          onClick={handleTranslate}
          disabled={uploading || generating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
        >
          {generating ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Translating...</>
          ) : (
            <><ImageIcon className="w-3.5 h-3.5" /> Translate Image</>
          )}
        </button>
      ) : (
        <button
          onClick={handleReplace}
          disabled={uploading || generating || analyzing || smartGenerating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
        >
          {generating ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
          ) : (
            <><Wand2 className="w-3.5 h-3.5" /> Generate Replacement</>
          )}
        </button>
      )}

      {/* Secondary actions */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.gif,.webp"
        onChange={handleFileSelected}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" /> Upload Image
          </>
        )}
      </button>

      {hasProductBank && (
        <button
          onClick={() => setPickingFromBank(true)}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Product Bank
        </button>
      )}

      {hasAssetBank && (
        <button
          onClick={() => setPickingFromAssets(true)}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Asset Bank
        </button>
      )}

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

      {/* Product bank picker modal */}
      {pickingFromBank && productData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingFromBank(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                Pick from Product Bank
              </h4>
              <button
                onClick={() => setPickingFromBank(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {productData.images.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">
                    No product images yet. Add them in the Product Bank.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {productData.images.map((pImg) => (
                    <button
                      key={pImg.id}
                      onClick={() => handleBankPick(pImg.url)}
                      className="group relative rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors"
                    >
                      <img
                        src={pImg.url}
                        alt={pImg.alt_text || "Product image"}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                        <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                      </div>
                      {pImg.description && (
                        <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                          {pImg.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Asset bank picker modal */}
      {pickingFromAssets && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingFromAssets(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                Pick from Asset Bank
              </h4>
              <button
                onClick={() => setPickingFromAssets(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-3 gap-2">
                {assetBankData.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => handleAssetPick(asset.url)}
                    className="group relative rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors"
                  >
                    <div className="aspect-square bg-gray-50 flex items-center justify-center p-2">
                      <img
                        src={asset.url}
                        alt={asset.alt_text || asset.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                      <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                      {asset.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
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
