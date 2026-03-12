"use client";

import { useEffect, useState } from "react";

export interface ProductOption {
  value: string;
  label: string;
}

let _cache: ProductOption[] | null = null;

export function useProducts(): ProductOption[] {
  const [products, setProducts] = useState<ProductOption[]>(_cache ?? []);

  useEffect(() => {
    if (_cache) return;
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: Array<{ slug: string; name: string }>) => {
        const opts = data.map((p) => ({ value: p.slug, label: p.name }));
        _cache = opts;
        setProducts(opts);
      })
      .catch(() => {});
  }, []);

  return products;
}

/** Simple label lookup for product slugs */
export function getProductLabel(products: ProductOption[], slug: string | null): string {
  if (!slug) return "—";
  return products.find((p) => p.value === slug)?.label ?? slug;
}
