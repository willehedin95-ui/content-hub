"use client";

import { useState, useEffect } from "react";
import { X, Loader2, BookmarkCheck, Search } from "lucide-react";
import type { CopyBankEntry, ProductSegment } from "@/types";

interface Props {
  product: string;
  language: string;
  segments: ProductSegment[];
  onSelect: (entry: CopyBankEntry) => void;
  onClose: () => void;
}

export default function CopyBankPicker({ product, language, segments, onSelect, onClose }: Props) {
  const [entries, setEntries] = useState<CopyBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSegment, setFilterSegment] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ product, language });
      if (filterSegment) params.set("segment_id", filterSegment);
      const res = await fetch(`/api/copy-bank?${params}`);
      if (res.ok) {
        setEntries(await res.json());
      }
      setLoading(false);
    }
    setLoading(true);
    load();
  }, [product, language, filterSegment]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-900">Copy Bank</h3>
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {language.toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segment filter chips */}
        {segments.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-gray-50 flex-wrap">
            <button
              onClick={() => setFilterSegment(null)}
              className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                filterSegment === null
                  ? "bg-purple-100 text-purple-700 font-medium"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {segments.map((s) => (
              <button
                key={s.id}
                onClick={() => setFilterSegment(s.id)}
                className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                  filterSegment === s.id
                    ? "bg-purple-100 text-purple-700 font-medium"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="text-center py-8">
              <Search className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No saved copies for this language yet</p>
            </div>
          )}

          {!loading && entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 transition-colors group"
            >
              <p className="text-sm text-gray-800 line-clamp-3 leading-relaxed">
                {entry.primary_text}
              </p>
              {entry.headline && (
                <p className="text-xs font-medium text-gray-600 mt-1.5 truncate">
                  {entry.headline}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                {entry.segment && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {entry.segment.name}
                  </span>
                )}
                {entry.source_concept_name && (
                  <span className="text-[10px] text-gray-400 truncate">
                    from {entry.source_concept_name}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
