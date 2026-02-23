"use client";

import { useState } from "react";
import { ArrowRight, Check, X, Image as ImageIcon } from "lucide-react";
import type { ProductImage } from "@/types";

interface Props {
  pageImages: { src: string; alt: string }[];
  productImages: ProductImage[];
  replacements: Record<string, string>;
  onReplacementsChange: (replacements: Record<string, string>) => void;
}

export default function ImageMapper({
  pageImages,
  productImages,
  replacements,
  onReplacementsChange,
}: Props) {
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  function handlePick(originalSrc: string, newSrc: string) {
    onReplacementsChange({ ...replacements, [originalSrc]: newSrc });
    setPickingFor(null);
  }

  function handleRemoveReplacement(originalSrc: string) {
    const next = { ...replacements };
    delete next[originalSrc];
    onReplacementsChange(next);
  }

  // Filter out tiny images (likely icons/tracking pixels)
  const meaningfulImages = pageImages.filter((img) => {
    const src = img.src.toLowerCase();
    return (
      !src.includes("pixel") &&
      !src.includes("tracking") &&
      !src.includes("favicon") &&
      !src.endsWith(".svg") &&
      !src.includes("1x1")
    );
  });

  if (meaningfulImages.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        Replace Images
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Click an image to replace it with one from your product bank
      </p>

      <div className="space-y-3">
        {meaningfulImages.map((img, i) => {
          const replacement = replacements[img.src];
          const isReplaced = !!replacement;

          return (
            <div
              key={`${img.src}-${i}`}
              className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                isReplaced
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              {/* Original image */}
              <div className="relative shrink-0">
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-16 h-16 rounded-md object-cover border border-gray-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {isReplaced && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>

              {/* Arrow */}
              {isReplaced && (
                <>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                  <img
                    src={replacement}
                    alt="Replacement"
                    className="w-16 h-16 rounded-md object-cover border border-emerald-200 shrink-0"
                  />
                </>
              )}

              {/* Info & actions */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 truncate">
                  {img.alt || img.src.split("/").pop()?.slice(0, 40)}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isReplaced ? (
                  <button
                    onClick={() => handleRemoveReplacement(img.src)}
                    className="text-xs text-gray-400 hover:text-red-500 p-1 rounded"
                    title="Remove replacement"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setPickingFor(img.src)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                  >
                    Replace
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Picker modal */}
      {pickingFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingFor(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                Pick Replacement Image
              </h4>
              <button
                onClick={() => setPickingFor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {productImages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">
                    No product images yet. Add them in the Product Bank.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {productImages.map((pImg) => (
                    <button
                      key={pImg.id}
                      onClick={() => handlePick(pickingFor, pImg.url)}
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
    </div>
  );
}
