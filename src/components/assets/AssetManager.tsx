"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  Pencil,
  X,
  Check,
  ImageIcon,
  FolderOpen,
} from "lucide-react";
import type { Asset, AssetCategory } from "@/types";
import { ASSET_CATEGORIES } from "@/types";

interface Props {
  initialAssets: Asset[];
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  product: "Product",
  model: "Model",
  lifestyle: "Lifestyle",
  graphic: "Graphic",
  logo: "Logo",
  before_after: "Before/After",
  other: "Other",
};

export default function AssetManager({ initialAssets }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeCategory, setActiveCategory] = useState<AssetCategory | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<AssetCategory>("other");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>("other");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const filtered =
    activeCategory === "all"
      ? assets
      : assets.filter((a) => a.category === activeCategory);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setPendingFile(file);
    setUploadName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setPreviewUrl(URL.createObjectURL(file));
    setShowUploadForm(true);
  }

  function cancelUpload() {
    setPendingFile(null);
    setPreviewUrl(null);
    setUploadName("");
    setUploadCategory("other");
    setShowUploadForm(false);
  }

  async function handleUpload() {
    if (!pendingFile || !uploadName.trim()) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("name", uploadName.trim());
      formData.append("category", uploadCategory);

      const res = await fetch("/api/assets", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const asset: Asset = await res.json();
      setAssets((prev) => [asset, ...prev]);
      cancelUpload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setEditName(asset.name);
    setEditCategory(asset.category);
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), category: editCategory }),
      });

      if (!res.ok) throw new Error("Update failed");

      const updated: Asset = await res.json();
      setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingId(null);
    } catch {
      alert("Failed to update asset");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this asset?")) return;
    setDeleting(id);

    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch {
      alert("Failed to delete asset");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Bank</h1>
          <p className="text-sm text-gray-500 mt-1">
            Logos, icons, badges, and other brand assets
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Asset
          </button>
        </div>
      </div>

      {/* Upload form modal */}
      {showUploadForm && pendingFile && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex gap-4">
            {previewUrl && (
              <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain bg-gray-50"
                />
              </div>
            )}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as AssetCategory)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadName.trim()}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {uploading ? "Uploading..." : "Upload"}
                </button>
                <button
                  onClick={cancelUpload}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 border border-gray-200 w-fit">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          All ({assets.length})
        </button>
        {ASSET_CATEGORIES.map((cat) => {
          const count = assets.filter((a) => a.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Asset grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm font-medium">No assets yet</p>
          <p className="text-xs mt-1">Upload logos, icons, and brand assets</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors"
            >
              <div className="aspect-square bg-gray-50 flex items-center justify-center p-3 relative">
                <img
                  src={asset.url}
                  alt={asset.alt_text || asset.name}
                  className="max-w-full max-h-full object-contain"
                />
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(asset)}
                    className="p-1 bg-white rounded-md shadow-sm border border-gray-200 text-gray-500 hover:text-gray-700"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    disabled={deleting === asset.id}
                    className="p-1 bg-white rounded-md shadow-sm border border-gray-200 text-red-400 hover:text-red-600 disabled:opacity-50"
                  >
                    {deleting === asset.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
              <div className="px-3 py-2 border-t border-gray-100">
                {editingId === asset.id ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                      autoFocus
                    />
                    <select
                      value={editCategory}
                      onChange={(e) =>
                        setEditCategory(e.target.value as AssetCategory)
                      }
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                    >
                      {ASSET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveEdit(asset.id)}
                        className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 text-white rounded px-2 py-1 text-xs hover:bg-indigo-700"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 flex items-center justify-center gap-1 bg-gray-100 text-gray-600 rounded px-2 py-1 text-xs hover:bg-gray-200"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {asset.name}
                    </p>
                    <p className="text-[10px] text-gray-400 capitalize">
                      {asset.category}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
