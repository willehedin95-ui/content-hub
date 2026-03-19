"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Clock, Image as ImageIcon, Trash2, Search, Loader2, CheckSquare, Square, MinusSquare, Archive, ArchiveRestore } from "lucide-react";
import { ImageJob, COUNTRY_MAP } from "@/types";
import { cn } from "@/lib/utils";
import { getMarketStatus, getWizardStep, getConceptThumbnail, COUNTRY_FLAGS } from "@/lib/concept-status";
import ConfirmDialog from "@/components/ui/confirm-dialog";

const PAGE_SIZE = 200;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "New", label: "New" },
  { value: "Images", label: "Images" },
  { value: "Ad Copy", label: "Ad Copy" },
  { value: "Preview", label: "Preview" },
  { value: "Launch Pad", label: "Launch Pad" },
  { value: "Ready", label: "Ready" },
  { value: "Published", label: "Published" },
] as const;

const STATUS_PRIORITY: Record<string, number> = {
  "New": 0,
  "Importing": 0,
  "Step 1/3 \u00B7 Images": 1,
  "Step 2/3 \u00B7 Ad Copy": 2,
  "Step 3/3 \u00B7 Preview": 3,
  "Launch Pad": 4,
  "Ready": 5,
  "Published": 6,
};

export default function ImagesPage() {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [avgSeconds, setAvgSeconds] = useState(75);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Filter and sort jobs
  const filteredJobs = jobs.filter((job) => {
    if (searchQuery && !job.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== "all") {
      const ws = getWizardStep(job);
      const match = statusFilter === ws.label || ws.label.includes(statusFilter);
      if (!match) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sort by status priority (asc), then by created_at (newest first)
    const aPri = STATUS_PRIORITY[getWizardStep(a).label] ?? 99;
    const bPri = STATUS_PRIORITY[getWizardStep(b).label] ?? 99;
    if (aPri !== bPri) return aPri - bPri;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const fetchJobs = useCallback(async () => {
    try {
      const archiveParam = showArchived ? "&archived=true" : "";
      const res = await fetch(`/api/image-jobs?page=1&limit=${PAGE_SIZE}${archiveParam}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? data);
        if (data.total !== undefined) setTotalCount(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetch("/api/image-jobs/progress")
      .then((res) => res.json())
      .then((data) => {
        if (data.avgSeconds) setAvgSeconds(data.avgSeconds);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Poll when any job is processing
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === "draft" || j.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  async function handleDelete(jobId: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/image-jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setTotalCount((n) => Math.max(0, n - 1));
    }
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredJobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredJobs.map((j) => j.id)));
    }
  }

  async function handleBulkDelete() {
    setConfirmBulkDelete(false);
    setBulkDeleting(true);
    const ids = [...selected];
    await Promise.all(ids.map((id) => fetch(`/api/image-jobs/${id}`, { method: "DELETE" })));
    setJobs((prev) => prev.filter((j) => !selected.has(j.id)));
    setTotalCount((n) => Math.max(0, n - ids.length));
    setSelected(new Set());
    setBulkDeleting(false);
  }

  async function handleArchive(ids: string[], action: "archive" | "unarchive") {
    setArchiving(true);
    try {
      const res = await fetch("/api/image-jobs/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
        setTotalCount((n) => Math.max(0, n - ids.length));
        setSelected(new Set());
      }
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Concepts</h1>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
        <Clock className="w-3.5 h-3.5" />
        Current average: ~{avgSeconds}s per image
      </p>

      {/* Filters */}
      {!loading && jobs.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          {/* Archive toggle */}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showArchived
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "text-gray-400 hover:text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {showArchived ? "Showing archived" : "Archived"}
          </button>
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concepts..."
              className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          {/* Status filter */}
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((sf) => (
              <button
                key={sf.value}
                onClick={() => setStatusFilter(sf.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === sf.value
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
          {/* Select all toggle */}
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 transition-colors ml-auto"
          >
            {selected.size === filteredJobs.length && filteredJobs.length > 0
              ? <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
              : selected.size > 0
              ? <MinusSquare className="w-3.5 h-3.5 text-indigo-600" />
              : <Square className="w-3.5 h-3.5" />}
            Select
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700">
            {selected.size} selected
          </span>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {bulkDeleting ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => handleArchive([...selected], showArchived ? "unarchive" : "archive")}
            disabled={archiving}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 bg-white border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            {showArchived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
              <div className="aspect-[4/5] bg-gray-100" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No ad concepts yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Click &quot;+ New Ad Concept&quot; to create your first batch
          </p>
        </div>
      ) : (
        <>
          {filteredJobs.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No concepts match your filters
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredJobs.map((job) => {
                const status = getWizardStep(job);
                const conceptNum = job.concept_number;
                const thumbUrl = getConceptThumbnail(job);
                const isSelected = selected.has(job.id);
                const marketStatus = getMarketStatus(job);
                const isProcessing = job.status === "draft" || job.status === "processing";

                // Market deployment dots
                const deployedCountries = job.target_languages
                  .map((lang) => {
                    const country = COUNTRY_MAP[lang];
                    const depStatus = marketStatus.get(country);
                    return depStatus === "pushed" ? country : null;
                  })
                  .filter(Boolean) as string[];

                return (
                  <Link
                    key={job.id}
                    href={`/images/${job.id}`}
                    className={cn(
                      "group relative bg-white border rounded-xl overflow-hidden transition-all hover:shadow-md hover:border-gray-300",
                      isSelected ? "border-indigo-400 ring-2 ring-indigo-200" : "border-gray-200"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[4/5] bg-gray-50 relative overflow-hidden">
                      {thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrl}
                          alt={job.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-gray-200" />
                        </div>
                      )}

                      {/* Processing shimmer overlay */}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                      )}

                      {/* Concept number badge (top-left) */}
                      {conceptNum && (
                        <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                          #{String(conceptNum).padStart(3, "0")}
                        </span>
                      )}

                      {/* Live market flags (top-right) */}
                      {deployedCountries.length > 0 && (
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 rounded">
                          {deployedCountries.map((c) => (
                            <span key={c} className="text-xs" role="img" aria-label={c}>{COUNTRY_FLAGS[c]}</span>
                          ))}
                        </div>
                      )}

                      {/* Selection checkbox (top-right on hover, or always if selected) */}
                      <button
                        onClick={(e) => toggleSelect(job.id, e)}
                        className={cn(
                          "absolute top-2 transition-opacity",
                          deployedCountries.length > 0 ? "right-2 top-8" : "right-2",
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-indigo-600 drop-shadow-md" />
                          : <Square className="w-5 h-5 text-white drop-shadow-md" />}
                      </button>
                    </div>

                    {/* Info bar */}
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                        {job.name}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Concept count */}
          <p className="text-xs text-gray-400 mt-4">
            {filteredJobs.length} concept{filteredJobs.length !== 1 ? "s" : ""}
            {totalCount > filteredJobs.length && ` of ${totalCount}`}
          </p>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete concept"
        message="Delete this concept and all its translations?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selected.size} concepts`}
        message={`This will permanently delete ${selected.size} concept${selected.size === 1 ? "" : "s"} and all their translations. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size}`}
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
