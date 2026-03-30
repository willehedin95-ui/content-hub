"use client";

import { useState } from "react";
import { PAGE_TYPES } from "@/types";

interface Props {
  pageId: string;
  initialProduct: string;
  initialPageType: string;
  products: { value: string; label: string }[];
}

export default function EditableProductType({ pageId, initialProduct, initialPageType, products }: Props) {
  const [product, setProduct] = useState(initialProduct);
  const [pageType, setPageType] = useState(initialPageType);
  const [saving, setSaving] = useState(false);

  const save = async (field: "product" | "page_type", value: string) => {
    setSaving(true);
    try {
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch {
      // revert on error
      if (field === "product") setProduct(product);
      else setPageType(pageType);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={product}
        onChange={(e) => {
          setProduct(e.target.value);
          save("product", e.target.value);
        }}
        disabled={saving}
        className={`text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full border-0 cursor-pointer hover:bg-gray-200 transition-colors ${saving ? "opacity-50" : ""}`}
      >
        <option value="">No product</option>
        {products.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <select
        value={pageType}
        onChange={(e) => {
          setPageType(e.target.value);
          save("page_type", e.target.value);
        }}
        disabled={saving}
        className={`text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full border-0 cursor-pointer hover:bg-gray-200 transition-colors ${saving ? "opacity-50" : ""}`}
      >
        {PAGE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
