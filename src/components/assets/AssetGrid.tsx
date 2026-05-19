"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  Pencil,
  X,
  Check,
  Search,
  Link as LinkIcon,
  Play,
  Tag,
  Download,
  Wand2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset, AssetCategory, MediaType, Product } from "@/types";
import { ASSET_CATEGORIES } from "@/types";

interface Props {
  assets: Asset[];
  mediaType: MediaType;
  onAssetsChange: (assets: Asset[]) => void;
  onOpenUrlImport: () => void;
  activeProduct: Product | "all" | "general";
  /** Optional callback for "Edit (post-prod)" button in preview modal.
   *  When set, the button is shown and clicking it hands the asset to the
   *  parent (AssetManager) which switches the view to Post Production
   *  with this asset preselected. */
  onEditPostProd?: (asset: Asset) => void;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  product: "Product",
  model: "Model / People",
  lifestyle: "Lifestyle",
  graphic: "Graphic",
  logo: "Logo",
  before_after: "Before / After",
  post_production: "Post Production",
  other: "Other",
};

const PRODUCT_OPTIONS = [
  { value: "", label: "General (no product)" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];

const SUGGESTED_TAGS = [
  "neck pain",
  "snoring",
  "sleep quality",
  "back pain",
  "testimonial",
  "before after",
  "social proof",
  "scientific",
  "lifestyle",
  "unboxing",
];

export default function AssetGrid({
  assets,
  mediaType,
  onAssetsChange,
  onOpenUrlImport,
  activeProduct,
  onEditPostProd,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<AssetCategory | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>("other");
  const [uploadProduct, setUploadProduct] = useState<string>("");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<AssetCategory>("other");
  const [editProduct, setEditProduct] = useState<string>("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // Multi-select for bulk download
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Filter by media type, product, category, and search
  const filteredAssets = assets.filter((asset) => {
    if (asset.media_type !== mediaType) return false;

    if (activeProduct !== "all") {
      if (activeProduct === "general" && asset.product !== null) return false;
      if (activeProduct !== "general" && asset.product !== activeProduct) return false;
    }

    if (activeCategory !== "all" && asset.category !== activeCategory) return false;

    if (activeTag && !asset.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase())) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const nameMatch = asset.name.toLowerCase().includes(query);
      const categoryMatch = asset.category.toLowerCase().includes(query);
      const tagsMatch = asset.tags.some((tag) => tag.toLowerCase().includes(query));
      if (!nameMatch && !categoryMatch && !tagsMatch) return false;
    }

    return true;
  });

  const categoryCounts = ASSET_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = assets.filter(
      (a) => a.media_type === mediaType && a.category === cat
    ).length;
    return acc;
  }, {} as Record<AssetCategory, number>);

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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setUploadName("");
    setUploadCategory("other");
    setUploadProduct("");
    setUploadTags([]);
    setUploadTagInput("");
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
      if (uploadProduct) {
        formData.append("product", uploadProduct);
      }
      if (uploadTags.length > 0) {
        formData.append("tags", uploadTags.join(","));
      }

      const res = await fetch("/api/assets", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const asset: Asset = await res.json();
      onAssetsChange([asset, ...assets]);
      cancelUpload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
  }, [filteredAssets]);

  const handleBulkDownload = useCallback(async () => {
    if (selectedIds.size === 0 || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/assets/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Download failed: ${res.status}`);
      }
      // Trigger browser download from the zip blob response.
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const filenameMatch = cd.match(/filename="([^"]+)"/);
      const fallbackName = `assets-${new Date().toISOString().slice(0, 10)}.zip`;
      const filename = filenameMatch?.[1] ?? fallbackName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const failedCount = Number(res.headers.get("x-failed-count") || "0");
      if (failedCount > 0) {
        alert(`Downloaded but ${failedCount} asset(s) failed to fetch and were skipped.`);
      }
      clearSelection();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bulk download failed");
    } finally {
      setDownloading(false);
    }
  }, [selectedIds, downloading, clearSelection]);

  function openPreview(asset: Asset) {
    setPreviewAsset(asset);
    setEditName(asset.name);
    setEditCategory(asset.category);
    setEditProduct(asset.product || "");
    setEditTags(asset.tags || []);
    setEditTagInput("");
  }

  const closePreview = useCallback(() => {
    setPreviewAsset(null);
  }, []);

  useEffect(() => {
    if (!previewAsset) return;
    function onKeyDown(e: KeyboardEvent) {
      // Don't hijack keys when the user is editing a text field inside the modal
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        closePreview();
        return;
      }
      if (isEditing) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = filteredAssets.findIndex((a) => a.id === previewAsset!.id);
        if (idx === -1) return;
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const next = filteredAssets[idx + delta];
        if (next) openPreview(next);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAsset, filteredAssets, closePreview]);

  async function savePreviewEdit() {
    if (!previewAsset) return;
    try {
      const res = await fetch(`/api/assets/${previewAsset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          category: editCategory,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated: Asset = await res.json();
      onAssetsChange(assets.map((a) => (a.id === previewAsset.id ? updated : a)));
      setPreviewAsset(updated);
    } catch {
      alert("Failed to update asset");
    }
  }

  function handleDownloadPreviewAsset() {
    if (!previewAsset) return;
    const ext = previewAsset.media_type === "video" ? "mp4" : "jpg";
    const filename = `${previewAsset.name.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;
    const proxiedUrl = `/api/download-proxy?url=${encodeURIComponent(previewAsset.url)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = proxiedUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setEditName(asset.name);
    setEditCategory(asset.category);
    setEditProduct(asset.product || "");
    setEditTags(asset.tags || []);
    setEditTagInput("");
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          category: editCategory,
          product: editProduct || null,
          tags: editTags,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      const updated: Asset = await res.json();
      onAssetsChange(assets.map((a) => (a.id === id ? updated : a)));
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
      onAssetsChange(assets.filter((a) => a.id !== id));
    } catch {
      alert("Failed to delete asset");
    } finally {
      setDeleting(null);
    }
  }

  const accept =
    mediaType === "image"
      ? "image/*"
      : "video/mp4,video/quicktime,.mp4,.mov,.webm";

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={onOpenUrlImport}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          Import URL
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Upload form */}
      {showUploadForm && pendingFile && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex gap-4">
            {previewUrl && (
              <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50">
                {mediaType === "image" ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <video
                    src={previewUrl}
                    className="w-full h-full object-contain"
                    muted
                  />
                )}
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Product
                  </label>
                  <select
                    value={uploadProduct}
                    onChange={(e) => setUploadProduct(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {PRODUCT_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {uploadTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        onClick={() => setUploadTags(uploadTags.filter((t) => t !== tag))}
                        className="text-indigo-400 hover:text-indigo-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={uploadTagInput}
                    onChange={(e) => setUploadTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && uploadTagInput.trim()) {
                        e.preventDefault();
                        const tag = uploadTagInput.trim().toLowerCase();
                        if (!uploadTags.includes(tag)) setUploadTags([...uploadTags, tag]);
                        setUploadTagInput("");
                      }
                    }}
                    placeholder="Type and press Enter..."
                    className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {SUGGESTED_TAGS.filter((t) => !uploadTags.includes(t)).slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setUploadTags([...uploadTags, tag])}
                      className="text-[10px] bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-full px-2 py-0.5 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
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

      {/* Category filter pills */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 border border-gray-200 w-fit">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeCategory === "all"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          All ({filteredAssets.length})
        </button>
        {ASSET_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Tag filter pills */}
      {(() => {
        const allTags = Array.from(
          new Set(
            assets
              .filter((a) => a.media_type === mediaType)
              .flatMap((a) => a.tags || [])
              .map((t) => t.toLowerCase())
          )
        ).sort();
        if (allTags.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 mb-6 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="text-[10px] text-gray-400 hover:text-gray-600 underline mr-1"
              >
                Clear
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                  activeTag === tag
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Bulk-select toolbar - appears when 1+ selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-indigo-900">
              {selectedIds.size} selected
            </span>
            <button
              onClick={selectAllFiltered}
              className="text-xs text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
              disabled={selectedIds.size === filteredAssets.length}
            >
              Select all ({filteredAssets.length})
            </button>
            <button
              onClick={clearSelection}
              className="text-xs text-gray-600 hover:text-gray-800 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
          <button
            onClick={handleBulkDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {downloading ? "Zipping…" : `Download ${selectedIds.size}`}
          </button>
        </div>
      )}

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Upload className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">No assets found</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Try a different search"
                : `Upload ${mediaType === "image" ? "images" : "videos"} to get started`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-6">
            {filteredAssets.map((asset) => {
              const isSelected = selectedIds.has(asset.id);
              return (
              <div
                key={asset.id}
                className={cn(
                  "group bg-white border rounded-xl overflow-hidden transition-colors",
                  isSelected
                    ? "border-indigo-500 ring-2 ring-indigo-200"
                    : "border-gray-200 hover:border-gray-300",
                )}
              >
                <div
                  className="aspect-square bg-gray-50 flex items-center justify-center p-3 relative cursor-pointer"
                  onClick={() => openPreview(asset)}
                >
                  {/* Selection checkbox - top-left, always visible-on-hover or when selected */}
                  <button
                    type="button"
                    aria-label={isSelected ? "Deselect asset" : "Select asset"}
                    onClick={(e) => { e.stopPropagation(); toggleSelected(asset.id); }}
                    className={cn(
                      "absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-md border flex items-center justify-center transition-opacity",
                      isSelected
                        ? "opacity-100 bg-indigo-600 border-indigo-600 text-white"
                        : "opacity-0 group-hover:opacity-100 bg-white/90 border-gray-300 text-transparent hover:text-gray-400",
                    )}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </button>
                  {asset.media_type === "image" ? (
                    <img
                      src={asset.url}
                      alt={asset.alt_text || asset.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <>
                      <video
                        src={asset.url}
                        className="max-w-full max-h-full object-contain"
                        muted
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/50 rounded-full p-3">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(asset); }}
                      className="p-1 bg-white rounded-md shadow-sm border border-gray-200 text-gray-500 hover:text-gray-700"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
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
                        onChange={(e) => setEditCategory(e.target.value as AssetCategory)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        {ASSET_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editProduct}
                        onChange={(e) => setEditProduct(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        {PRODUCT_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[10px] text-gray-400 capitalize">
                          {asset.category}
                        </p>
                        {asset.product && (
                          <>
                            <span className="text-[10px] text-gray-300">•</span>
                            <p className="text-[10px] text-gray-400 capitalize">
                              {asset.product}
                            </p>
                          </>
                        )}
                      </div>
                      {asset.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {asset.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] bg-indigo-50 text-indigo-600 rounded-full px-1.5 py-px"
                            >
                              {tag}
                            </span>
                          ))}
                          {asset.tags.length > 3 && (
                            <span className="text-[9px] text-gray-400">
                              +{asset.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {previewAsset.name}
              </h3>
              <button
                onClick={closePreview}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Large preview with prev/next nav */}
              <div className="flex-1 bg-gray-50 flex items-center justify-center p-6 min-h-[400px] relative">
                {(() => {
                  const idx = filteredAssets.findIndex((a) => a.id === previewAsset.id);
                  const prev = idx > 0 ? filteredAssets[idx - 1] : null;
                  const next = idx >= 0 && idx < filteredAssets.length - 1 ? filteredAssets[idx + 1] : null;
                  return (
                    <>
                      {prev && (
                        <button
                          type="button"
                          onClick={() => openPreview(prev)}
                          aria-label="Previous image"
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 border border-gray-200 text-gray-700 hover:bg-white shadow-md flex items-center justify-center"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                      {next && (
                        <button
                          type="button"
                          onClick={() => openPreview(next)}
                          aria-label="Next image"
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 border border-gray-200 text-gray-700 hover:bg-white shadow-md flex items-center justify-center"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      )}
                      {idx >= 0 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[10px] font-medium">
                          {idx + 1} / {filteredAssets.length} · ← → to navigate
                        </div>
                      )}
                    </>
                  );
                })()}
                {previewAsset.media_type === "image" ? (
                  <img
                    src={previewAsset.url}
                    alt={previewAsset.alt_text || previewAsset.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  />
                ) : (
                  <video
                    src={previewAsset.url}
                    controls
                    className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  />
                )}
              </div>

              {/* Settings panel */}
              <div className="w-72 border-l border-gray-100 p-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as AssetCategory)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Metadata */}
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  {previewAsset.dimensions && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Dimensions</span>
                      <span className="text-gray-600">
                        {previewAsset.dimensions}
                      </span>
                    </div>
                  )}
                  {previewAsset.file_size && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Size</span>
                      <span className="text-gray-600">
                        {(previewAsset.file_size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                  )}
                  {previewAsset.duration && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Duration</span>
                      <span className="text-gray-600">{previewAsset.duration}s</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Added</span>
                    <span className="text-gray-600">
                      {new Date(previewAsset.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={savePreviewEdit}
                  disabled={!editName.trim()}
                  className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
                {onEditPostProd && previewAsset.media_type === "image" && (
                  <button
                    onClick={() => { onEditPostProd(previewAsset); closePreview(); }}
                    className="w-full flex items-center justify-center gap-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-50 transition-colors"
                  >
                    <Wand2 className="w-4 h-4" />
                    Edit (Post Production)
                  </button>
                )}
                <button
                  onClick={handleDownloadPreviewAsset}
                  className="w-full flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => { handleDelete(previewAsset.id); closePreview(); }}
                  className="w-full flex items-center justify-center gap-1.5 bg-white border border-red-200 text-red-500 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Asset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
