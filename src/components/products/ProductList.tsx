"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, Image as ImageIcon } from "lucide-react";
import type { ProductFull } from "@/types";

interface Props {
  initialProducts: (ProductFull & {
    product_images?: { id: string; url: string; category: string }[];
  })[];
}

export default function ProductList({ initialProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    if (!newSlug.trim() || !newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim(), name: newName.trim() }),
      });
      if (res.ok) {
        const product = await res.json();
        setProducts((prev) => [...prev, product]);
        setNewSlug("");
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Bank</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage product info, images, and copywriting guidelines
          </p>
        </div>
      </div>

      {/* Product cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {products.map((product) => {
          const heroImage = product.product_images?.find(
            (img) => img.category === "hero"
          );
          const imageCount = product.product_images?.length ?? 0;

          return (
            <button
              key={product.id}
              onClick={() => router.push(`/products/${product.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                {heroImage ? (
                  <img
                    src={heroImage.url}
                    alt={product.name}
                    className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                    <Package className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {product.slug}
                  </p>
                  {product.tagline && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {product.tagline}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {imageCount > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {imageCount}
                      </span>
                    )}
                    {product.benefits && product.benefits.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {product.benefits.length} benefits
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Add new product card */}
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Product
          </h3>
          <div className="space-y-2">
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="slug (e.g. happysleep)"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name (e.g. HappySleep)"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newSlug.trim() || !newName.trim()}
              className="w-full bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating..." : "Create Product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
