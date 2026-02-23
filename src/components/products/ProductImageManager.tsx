"use client";

import { useState, useRef } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import type { ProductImage, ImageCategory } from "@/types";
import { IMAGE_CATEGORIES } from "@/types";

interface Props {
  productId: string;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
}

export default function ProductImageManager({
  productId,
  images,
  onImagesChange,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ImageCategory>("hero");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", selectedCategory);

        const res = await fetch(`/api/products/${productId}/images`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const image = await res.json();
          onImagesChange([...images, image]);
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    setDeleting(imageId);
    try {
      const res = await fetch(
        `/api/products/${productId}/images/${imageId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onImagesChange(images.filter((img) => img.id !== imageId));
      }
    } finally {
      setDeleting(null);
    }
  }

  const grouped = IMAGE_CATEGORIES.map((cat) => ({
    ...cat,
    images: images.filter((img) => img.category === cat.value),
  }));

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Upload Images
        </h3>
        <div className="flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(e.target.value as ImageCategory)
            }
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          >
            {IMAGE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {/* Image grid by category */}
      {grouped.map(
        (group) =>
          group.images.length > 0 && (
            <div key={group.value}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {group.images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <img
                      src={img.url}
                      alt={img.alt_text || "Product image"}
                      className="w-full aspect-square object-cover"
                    />
                    <button
                      onClick={() => handleDelete(img.id)}
                      disabled={deleting === img.id}
                      className="absolute top-1.5 right-1.5 bg-white/90 border border-gray-200 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-200"
                    >
                      {deleting === img.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      )}
                    </button>
                    {img.description && (
                      <p className="px-2 py-1.5 text-xs text-gray-500 truncate">
                        {img.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {images.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No images yet. Upload product images above.</p>
        </div>
      )}
    </div>
  );
}
