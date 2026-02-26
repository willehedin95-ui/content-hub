"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Link as LinkIcon } from "lucide-react";
import { SPY_CATEGORIES, SPY_COUNTRIES, SpyBrand } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (brand: SpyBrand) => void;
  editBrand?: SpyBrand | null;
}

export default function AddBrandModal({ open, onClose, onCreated, editBrand }: Props) {
  const [name, setName] = useState("");
  const [adLibraryUrl, setAdLibraryUrl] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [countries, setCountries] = useState<string[]>(["US"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!editBrand;

  useEffect(() => {
    if (editBrand) {
      setName(editBrand.name);
      setAdLibraryUrl(editBrand.ad_library_url);
      setCategory(editBrand.category ?? "");
      setNotes(editBrand.notes ?? "");
      setCountries(editBrand.scrape_countries?.length ? editBrand.scrape_countries : ["US"]);
    } else {
      setName("");
      setAdLibraryUrl("");
      setCategory("");
      setNotes("");
      setCountries(["US"]);
    }
    setError("");
  }, [editBrand, open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !adLibraryUrl.trim()) return;

    // Basic URL validation
    if (!adLibraryUrl.includes("facebook.com/ads/library")) {
      setError("URL must be a Meta Ad Library URL (facebook.com/ads/library/...)");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const url = isEdit
        ? `/api/spy/brands/${editBrand!.id}`
        : "/api/spy/brands";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ad_library_url: adLibraryUrl.trim(),
          category: category || null,
          notes: notes.trim() || null,
          scrape_countries: countries.length > 0 ? countries : ["US"],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save brand");
      }

      const { data } = await res.json();
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Brand" : "Add Competitor Brand"}
          </h2>
          <button onClick={onClose} disabled={submitting} className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., AG1, Oslo Skin Lab"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Ad Library URL */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              Meta Ad Library URL
            </label>
            <input
              type="url"
              value={adLibraryUrl}
              onChange={(e) => setAdLibraryUrl(e.target.value)}
              placeholder="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=..."
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">
              Go to Meta Ad Library, find the brand, copy the full URL
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">Select category...</option>
              {SPY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Scrape Countries */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Scrape Countries</label>
            <div className="flex flex-wrap gap-1.5">
              {SPY_COUNTRIES.map((c) => {
                const selected = countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      if (c.code === "ALL") {
                        setCountries(selected ? ["US"] : ["ALL"]);
                      } else {
                        setCountries((prev) => {
                          const without = prev.filter((x) => x !== "ALL");
                          return selected
                            ? without.filter((x) => x !== c.code)
                            : [...without, c.code];
                        });
                      }
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {c.code === "ALL" ? "All" : c.code}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Select US/GB for English ads. Each country = separate scrape.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Direct competitor in sleep supplements, targets SE/NO"
              rows={2}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {error && <p className="text-red-600 text-sm">{error}</p>}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !adLibraryUrl.trim()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Brand"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
