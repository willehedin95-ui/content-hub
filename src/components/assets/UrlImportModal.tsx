"use client";

import { useState } from "react";
import { X, Loader2, Link as LinkIcon, Check } from "lucide-react";
import type { Asset, AssetCategory, MediaType, Product } from "@/types";
import { ASSET_CATEGORIES } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAssetCreated: (asset: Asset) => void;
  defaultMediaType?: MediaType;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  product: "Product",
  model: "Model / People",
  lifestyle: "Lifestyle",
  graphic: "Graphic",
  logo: "Logo",
  before_after: "Before / After",
  other: "Other",
};

const PRODUCT_OPTIONS = [
  { value: "", label: "General (no product)" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];

export default function UrlImportModal({
  open,
  onClose,
  onAssetCreated,
  defaultMediaType = "image",
}: Props) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("other");
  const [product, setProduct] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim() || !name.trim()) return;
    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/assets/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim(),
          category,
          product: product || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const asset: Asset = await res.json();
      onAssetCreated(asset);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setUrl("");
    setName("");
    setCategory("other");
    setProduct("");
    setError(null);
    onClose();
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    // Auto-populate name from URL if name is empty
    if (!name && value) {
      const filename = value.split("/").pop()?.split("?")[0] || "";
      const cleanName = filename
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]/g, " ")
        .trim();
      if (cleanName) {
        setName(cleanName);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Import from URL</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Asset URL
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Asset name"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Product
            </label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleImport}
              disabled={importing || !url.trim() || !name.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Import
                </>
              )}
            </button>
            <button
              onClick={handleClose}
              disabled={importing}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
