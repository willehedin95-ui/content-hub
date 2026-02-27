"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Bookmark, Loader2 } from "lucide-react";
import { SavedAd } from "@/types";
import SavedAdCard from "./SavedAdCard";
import SavedAdDetail from "./SavedAdDetail";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export default function SavedAdsDashboard() {
  const searchParams = useSearchParams();

  const [ads, setAds] = useState<SavedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAd, setSelectedAd] = useState<SavedAd | null>(null);

  // Filters
  const [platform, setPlatform] = useState("all");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [search, setSearch] = useState("");

  const fetchAds = useCallback(
    async (p = 1, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("limit", String(PAGE_SIZE));
        if (platform !== "all") params.set("platform", platform);
        if (bookmarkedOnly) params.set("is_bookmarked", "true");
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/saved-ads?${params}`);
        if (res.ok) {
          const data = await res.json();
          const newAds: SavedAd[] = data.data ?? [];
          setAds((prev) => (append ? [...prev, ...newAds] : newAds));
          setTotal(data.total ?? 0);
          setPage(p);
          setHasMore(newAds.length === PAGE_SIZE);
        }
      } finally {
        setLoading(false);
      }
    },
    [platform, bookmarkedOnly, search]
  );

  useEffect(() => {
    fetchAds(1, false);
  }, [fetchAds]);

  // Deep link support: ?id=xxx from Telegram bot
  useEffect(() => {
    const deepLinkId = searchParams.get("id");
    if (deepLinkId && ads.length > 0) {
      const found = ads.find((a) => a.id === deepLinkId);
      if (found) setSelectedAd(found);
    }
  }, [searchParams, ads]);

  async function handleBookmark(id: string, bookmarked: boolean) {
    const res = await fetch(`/api/saved-ads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_bookmarked: bookmarked }),
    });
    if (res.ok) {
      setAds((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_bookmarked: bookmarked } : a))
      );
      if (selectedAd?.id === id) {
        setSelectedAd((prev) =>
          prev ? { ...prev, is_bookmarked: bookmarked } : prev
        );
      }
    }
  }

  async function handleNotesChange(id: string, notes: string) {
    await fetch(`/api/saved-ads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_notes: notes }),
    });
  }

  function handleAnalyzed(updatedAd: SavedAd) {
    setAds((prev) =>
      prev.map((a) => (a.id === updatedAd.id ? updatedAd : a))
    );
    setSelectedAd(updatedAd);
    toast.success("CASH analysis complete");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this saved ad?")) return;
    const res = await fetch(`/api/saved-ads/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAds((prev) => prev.filter((a) => a.id !== id));
      if (selectedAd?.id === id) setSelectedAd(null);
      setTotal((prev) => prev - 1);
      toast.success("Saved ad deleted");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saved Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ads captured via Telegram bot &middot; {total} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        {/* Platform */}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="bg-white border border-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>

        {/* Bookmarked */}
        <button
          onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
            bookmarkedOnly
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-white border-gray-200 text-gray-500 hover:text-gray-700"
          }`}
        >
          <Bookmark
            className={`w-3.5 h-3.5 ${bookmarkedOnly ? "fill-amber-500" : ""}`}
          />
          Bookmarked
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ads..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      {/* Grid */}
      {loading && ads.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium mb-2">No saved ads yet</p>
          <p className="text-sm">
            Send an ad URL or screenshot to your Telegram bot to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {ads.map((ad) => (
              <SavedAdCard
                key={ad.id}
                ad={ad}
                isSelected={selectedAd?.id === ad.id}
                onClick={() => setSelectedAd(ad)}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => fetchAds(page + 1, true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail panel */}
      {selectedAd && (
        <SavedAdDetail
          ad={selectedAd}
          onClose={() => setSelectedAd(null)}
          onBookmark={handleBookmark}
          onNotesChange={handleNotesChange}
          onAnalyzed={handleAnalyzed}
        />
      )}
    </div>
  );
}
