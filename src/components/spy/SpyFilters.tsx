"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X, Bookmark } from "lucide-react";
import { SpyBrand } from "@/types";

interface Props {
  brands: SpyBrand[];
  selectedBrandIds: Set<string>;
  onBrandChange: (ids: Set<string>) => void;
  mediaType: string;
  onMediaTypeChange: (type: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  bookmarkedOnly: boolean;
  onBookmarkedChange: (val: boolean) => void;
  search: string;
  onSearchChange: (val: string) => void;
}

export default function SpyFilters({
  brands,
  selectedBrandIds,
  onBrandChange,
  mediaType,
  onMediaTypeChange,
  sort,
  onSortChange,
  bookmarkedOnly,
  onBookmarkedChange,
  search,
  onSearchChange,
}: Props) {
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!brandDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBrandDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [brandDropdownOpen]);

  const filteredBrands = brandSearch
    ? brands.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands;

  function toggleBrand(id: string) {
    const next = new Set(selectedBrandIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onBrandChange(next);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 max-w-xs min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search ads..."
          className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors"
        />
      </div>

      {/* Brand multi-select dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setBrandDropdownOpen(!brandDropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 transition-colors"
        >
          {selectedBrandIds.size === 0
            ? "All Brands"
            : `${selectedBrandIds.size} brand${selectedBrandIds.size > 1 ? "s" : ""}`}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${brandDropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {selectedBrandIds.size > 0 && (
          <button
            onClick={() => onBrandChange(new Set())}
            className="ml-1 text-gray-400 hover:text-gray-600"
            title="Clear brand filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {brandDropdownOpen && (
          <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 flex flex-col">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Search brands..."
                className="w-full bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {filteredBrands.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">No brands</p>
              ) : (
                filteredBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => toggleBrand(brand.id)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selectedBrandIds.has(brand.id)
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-gray-300"
                    }`}>
                      {selectedBrandIds.has(brand.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="truncate text-gray-700">{brand.name}</span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">{brand.ad_count}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Media type toggle */}
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
        {["all", "image", "video"].map((type) => (
          <button
            key={type}
            onClick={() => onMediaTypeChange(type)}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              mediaType === type
                ? "bg-gray-100 text-gray-800"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {type === "all" ? "All" : type === "image" ? "Images" : "Videos"}
          </button>
        ))}
      </div>

      {/* Sort */}
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors"
      >
        <option value="impressions_rank">Top Ranked</option>
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
      </select>

      {/* Bookmark filter */}
      <button
        onClick={() => onBookmarkedChange(!bookmarkedOnly)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
          bookmarkedOnly
            ? "bg-amber-50 border-amber-300 text-amber-700"
            : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
        }`}
        title="Show bookmarked only"
      >
        <Bookmark className={`w-3.5 h-3.5 ${bookmarkedOnly ? "fill-amber-500" : ""}`} />
        Saved
      </button>
    </div>
  );
}
