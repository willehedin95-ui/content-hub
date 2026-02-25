"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, Loader2, Pencil, Trash2, Eye } from "lucide-react";
import { SpyBrand, SpyAd } from "@/types";
import SpyFilters from "./SpyFilters";
import SpyAdGrid from "./SpyAdGrid";
import SpyAdDetail from "./SpyAdDetail";
import AddBrandModal from "./AddBrandModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type Tab = "ads" | "brands";

const PAGE_SIZE = 50;

export default function SpyDashboard() {
  const [tab, setTab] = useState<Tab>("ads");

  // Brands
  const [brands, setBrands] = useState<SpyBrand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [editBrand, setEditBrand] = useState<SpyBrand | null>(null);
  const [deleteBrandId, setDeleteBrandId] = useState<string | null>(null);
  const [scrapingBrandIds, setScrapingBrandIds] = useState<Set<string>>(new Set());
  const [scrapeAllRunning, setScrapeAllRunning] = useState(false);

  // Ads
  const [ads, setAds] = useState<SpyAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsPage, setAdsPage] = useState(1);
  const [adsTotal, setAdsTotal] = useState(0);
  const [hasMoreAds, setHasMoreAds] = useState(false);
  const [selectedAd, setSelectedAd] = useState<SpyAd | null>(null);

  // Filters
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [mediaType, setMediaType] = useState("all");
  const [sort, setSort] = useState("impressions_rank");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [search, setSearch] = useState("");

  // --- Data fetching ---

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/spy/brands");
      if (res.ok) {
        const { data } = await res.json();
        setBrands(data ?? []);
      }
    } finally {
      setBrandsLoading(false);
    }
  }, []);

  const fetchAds = useCallback(
    async (page = 1, append = false) => {
      setAdsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        params.set("sort", sort);

        if (selectedBrandIds.size > 0) {
          params.set("brand_ids", Array.from(selectedBrandIds).join(","));
        }
        if (mediaType !== "all") params.set("media_type", mediaType);
        if (bookmarkedOnly) params.set("is_bookmarked", "true");
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/spy/ads?${params}`);
        if (res.ok) {
          const data = await res.json();
          const newAds: SpyAd[] = data.data ?? [];
          setAds((prev) => (append ? [...prev, ...newAds] : newAds));
          setAdsTotal(data.total ?? 0);
          setAdsPage(page);
          setHasMoreAds(newAds.length === PAGE_SIZE);
        }
      } finally {
        setAdsLoading(false);
      }
    },
    [sort, selectedBrandIds, mediaType, bookmarkedOnly, search]
  );

  // Initial load
  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  // Fetch ads when filters change
  useEffect(() => {
    fetchAds(1, false);
  }, [fetchAds]);

  // --- Brand actions ---

  function handleBrandCreated(brand: SpyBrand) {
    setBrands((prev) => {
      const exists = prev.find((b) => b.id === brand.id);
      if (exists) return prev.map((b) => (b.id === brand.id ? brand : b));
      return [...prev, brand];
    });
    setEditBrand(null);
    toast.success(editBrand ? "Brand updated" : "Brand added");
  }

  async function handleDeleteBrand() {
    if (!deleteBrandId) return;
    try {
      const res = await fetch(`/api/spy/brands/${deleteBrandId}`, { method: "DELETE" });
      if (res.ok) {
        setBrands((prev) => prev.filter((b) => b.id !== deleteBrandId));
        toast.success("Brand deleted");
        fetchAds(1, false);
      } else {
        toast.error("Failed to delete brand");
      }
    } finally {
      setDeleteBrandId(null);
    }
  }

  async function handleScrape(brandId: string) {
    setScrapingBrandIds((prev) => new Set([...prev, brandId]));
    try {
      const res = await fetch(`/api/spy/brands/${brandId}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_ads: 20 }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`Scraped: ${result.new} new, ${result.updated} updated (${result.total} total)`);
        fetchBrands();
        fetchAds(1, false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Scrape failed");
      }
    } catch {
      toast.error("Scrape request failed");
    } finally {
      setScrapingBrandIds((prev) => {
        const next = new Set(prev);
        next.delete(brandId);
        return next;
      });
    }
  }

  async function handleScrapeAll() {
    setScrapeAllRunning(true);
    const activeBrands = brands.filter((b) => b.is_active);
    for (const brand of activeBrands) {
      await handleScrape(brand.id);
    }
    setScrapeAllRunning(false);
    toast.success("All brands scraped");
  }

  // --- Ad actions ---

  async function handleBookmark(adId: string, bookmarked: boolean) {
    // Optimistic update
    setAds((prev) => prev.map((a) => (a.id === adId ? { ...a, is_bookmarked: bookmarked } : a)));
    if (selectedAd?.id === adId) {
      setSelectedAd((prev) => prev ? { ...prev, is_bookmarked: bookmarked } : prev);
    }

    await fetch(`/api/spy/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_bookmarked: bookmarked }),
    });
  }

  async function handleNotesChange(adId: string, notes: string) {
    await fetch(`/api/spy/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_notes: notes }),
    });
  }

  function handleAdAnalyzed(updatedAd: SpyAd) {
    setAds((prev) => prev.map((a) => (a.id === updatedAd.id ? updatedAd : a)));
    setSelectedAd(updatedAd);
    toast.success("CASH analysis complete");
  }

  function handleLoadMore() {
    fetchAds(adsPage + 1, true);
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Spy</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitor competitor ads from Meta Ad Library
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "brands" && (
            <>
              <button
                onClick={handleScrapeAll}
                disabled={scrapeAllRunning || brands.length === 0}
                className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {scrapeAllRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {scrapeAllRunning ? "Scraping..." : "Scrape All"}
              </button>
              <button
                onClick={() => { setEditBrand(null); setShowAddBrand(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Brand
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        <button
          onClick={() => setTab("ads")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "ads"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Ads
            {adsTotal > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{adsTotal}</span>
            )}
          </div>
        </button>
        <button
          onClick={() => setTab("brands")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "brands"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            Brands
            {brands.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{brands.length}</span>
            )}
          </div>
        </button>
      </div>

      {/* Tab content */}
      {tab === "ads" ? (
        <div className="space-y-4">
          {/* Filters */}
          <SpyFilters
            brands={brands}
            selectedBrandIds={selectedBrandIds}
            onBrandChange={setSelectedBrandIds}
            mediaType={mediaType}
            onMediaTypeChange={setMediaType}
            sort={sort}
            onSortChange={setSort}
            bookmarkedOnly={bookmarkedOnly}
            onBookmarkedChange={setBookmarkedOnly}
            search={search}
            onSearchChange={setSearch}
          />

          {/* Grid */}
          <SpyAdGrid
            ads={ads}
            loading={adsLoading}
            hasMore={hasMoreAds}
            onLoadMore={handleLoadMore}
            onAdClick={setSelectedAd}
            onBookmark={handleBookmark}
          />
        </div>
      ) : (
        /* Brands tab */
        <div>
          {brandsLoading ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
                    <div className="h-4 w-40 bg-gray-200 rounded" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-16 bg-gray-100 rounded" />
                    <div className="h-4 w-20 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : brands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Eye className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No competitor brands yet</p>
              <p className="text-gray-400 text-xs mt-1">
                Click &quot;Add Brand&quot; to start monitoring competitors
              </p>
              <button
                onClick={() => { setEditBrand(null); setShowAddBrand(true); }}
                className="mt-4 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First Brand
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_120px_80px_140px_200px] items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <div>Brand</div>
                <div>Category</div>
                <div>Ads</div>
                <div>Last Scraped</div>
                <div className="text-right">Actions</div>
              </div>

              {/* Table rows */}
              {brands.map((brand) => {
                const isScraping = scrapingBrandIds.has(brand.id);
                return (
                  <div
                    key={brand.id}
                    className="grid grid-cols-[1fr_120px_80px_140px_200px] items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                  >
                    {/* Name */}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{brand.name}</p>
                      {brand.notes && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{brand.notes}</p>
                      )}
                    </div>

                    {/* Category */}
                    <span className="text-xs text-gray-500">{brand.category ?? "—"}</span>

                    {/* Ad count */}
                    <span className="text-sm font-medium text-gray-700">{brand.ad_count}</span>

                    {/* Last scraped */}
                    <span className="text-xs text-gray-400">
                      {brand.last_fetched_at
                        ? new Date(brand.last_fetched_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "Never"}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleScrape(brand.id)}
                        disabled={isScraping}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isScraping ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {isScraping ? "Scraping..." : "Scrape"}
                      </button>
                      <button
                        onClick={() => { setEditBrand(brand); setShowAddBrand(true); }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteBrandId(brand.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Ad detail slide-over */}
      {selectedAd && (
        <SpyAdDetail
          ad={selectedAd}
          onClose={() => setSelectedAd(null)}
          onBookmark={handleBookmark}
          onNotesChange={handleNotesChange}
          onAnalyzed={handleAdAnalyzed}
        />
      )}

      {/* Add/Edit brand modal */}
      <AddBrandModal
        open={showAddBrand}
        onClose={() => { setShowAddBrand(false); setEditBrand(null); }}
        onCreated={handleBrandCreated}
        editBrand={editBrand}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteBrandId}
        title="Delete brand"
        message="Delete this brand and all its scraped ads? Bookmarked ads will also be deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteBrand}
        onCancel={() => setDeleteBrandId(null)}
      />
    </div>
  );
}
