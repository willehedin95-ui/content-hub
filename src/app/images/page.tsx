"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Clock, Image as ImageIcon, ChevronLeft, ChevronRight, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, Dna, Loader2, CheckSquare, Square, MinusSquare, Archive, ArchiveRestore } from "lucide-react";
import { ImageJob, PRODUCTS, COUNTRY_MAP } from "@/types";
import { cn } from "@/lib/utils";
import { getMarketStatus, getWizardStep, getConceptThumbnail, COUNTRY_FLAGS } from "@/lib/concept-status";
import NewConceptModal from "@/components/images/NewConceptModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { TagBadge, getTagColor } from "@/components/ui/tag-input";
import { useAllTags } from "@/lib/hooks/use-all-tags";

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toLowerCase();
}

type SortField = "concept_number" | "name" | "status" | "created_at";
type SortDir = "asc" | "desc";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "New", label: "New" },
  { value: "Images", label: "Images" },
  { value: "Ad Copy", label: "Ad Copy" },
  { value: "Preview", label: "Preview" },
  { value: "Ready", label: "Ready" },
  { value: "Published", label: "Published" },
] as const;

const STATUS_PRIORITY: Record<string, number> = {
  "New": 0,
  "Importing": 0,
  "Step 1/3 \u00B7 Images": 1,
  "Step 2/3 \u00B7 Ad Copy": 2,
  "Step 3/3 \u00B7 Preview": 3,
  "Ready": 4,
  "Published": 5,
};

export default function ImagesPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [avgSeconds, setAvgSeconds] = useState(75);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter & sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const { tags: allTags } = useAllTags();
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Filter and sort jobs client-side
  const filteredJobs = jobs.filter((job) => {
    if (searchQuery && !job.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== "all") {
      const ws = getWizardStep(job);
      const match = statusFilter === ws.label || ws.label.includes(statusFilter);
      if (!match) return false;
    }
    if (productFilter !== "all" && job.product !== productFilter) return false;
    if (tagFilter !== "all" && !(job.tags ?? []).includes(tagFilter)) return false;
    return true;
  }).sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "concept_number": return ((a.concept_number ?? Infinity) - (b.concept_number ?? Infinity)) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      case "status": {
        const aPri = STATUS_PRIORITY[getWizardStep(a).label] ?? 99;
        const bPri = STATUS_PRIORITY[getWizardStep(b).label] ?? 99;
        if (aPri !== bPri) return (aPri - bPri) * dir;
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      case "created_at": return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      default: return 0;
    }
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "created_at" ? "desc" : "asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/sort:opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  const fetchJobs = useCallback(async (p = page) => {
    try {
      const archiveParam = showArchived ? "&archived=true" : "";
      const res = await fetch(`/api/image-jobs?page=${p}&limit=${PAGE_SIZE}${archiveParam}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? data);
        if (data.total !== undefined) setTotalCount(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, showArchived]);

  async function handleBackfillDna() {
    setBackfillLoading(true);
    try {
      const res = await fetch("/api/image-jobs/backfill-dna", { method: "POST" });
      const data = await res.json();
      alert(`DNA backfill complete: ${data.analyzed}/${data.total} concepts analyzed`);
      fetchJobs();
    } catch {
      alert("Backfill failed");
    } finally {
      setBackfillLoading(false);
    }
  }

  // Fetch average generation time
  useEffect(() => {
    fetch("/api/image-jobs/progress")
      .then((res) => res.json())
      .then((data) => {
        if (data.avgSeconds) setAvgSeconds(data.avgSeconds);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

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

  function handleCreated(jobId: string) {
    setShowModal(false);
    router.push(`/images/${jobId}`);
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Concepts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackfillDna}
            disabled={backfillLoading}
            className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            title="Auto-analyze all concepts without DNA"
          >
            {backfillLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dna className="w-4 h-4" />}
            {backfillLoading ? "Analyzing..." : "Backfill DNA"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Ad Concept
          </button>
        </div>
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
            onClick={() => { setShowArchived((v) => !v); setPage(1); }}
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
          {/* Product filter */}
          <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
            <button
              onClick={() => setProductFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                productFilter === "all"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              All
            </button>
            {PRODUCTS.map((p) => (
              <button
                key={p.value}
                onClick={() => setProductFilter(p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  productFilter === p.value
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
              <button
                onClick={() => setTagFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  tagFilter === "all"
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                All Tags
              </button>
              {allTags.map((tag) => {
                const color = getTagColor(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                      tagFilter === tag
                        ? `${color.bg} ${color.text} ${color.border}`
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-transparent"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
                <div className="h-4 w-8 bg-gray-200 rounded" />
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[32px_48px_48px_1fr_80px_140px_100px_64px_40px] items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <button
              onClick={toggleSelectAll}
              className="flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              {selected.size === filteredJobs.length && filteredJobs.length > 0
                ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                : selected.size > 0
                ? <MinusSquare className="w-4 h-4 text-indigo-600" />
                : <Square className="w-4 h-4" />}
            </button>
            <button onClick={() => toggleSort("concept_number")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
              # <SortIcon field="concept_number" />
            </button>
            <div></div>
            <button onClick={() => toggleSort("name")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors text-left">
              Name <SortIcon field="name" />
            </button>
            <div>Product</div>
            <button onClick={() => toggleSort("status")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
              Status <SortIcon field="status" />
            </button>
            <div>Markets</div>
            <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
              Created <SortIcon field="created_at" />
            </button>
            <div></div>
          </div>

          {/* Table rows */}
          {filteredJobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No concepts match your filters
            </div>
          ) : filteredJobs.map((job) => {
            const marketStatus = getMarketStatus(job);
            const status = getWizardStep(job);
            const conceptNum = job.concept_number;

            return (
              <Link
                key={job.id}
                href={`/images/${job.id}`}
                className={cn(
                  "grid grid-cols-[32px_48px_48px_1fr_80px_140px_100px_64px_40px] items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors group",
                  selected.has(job.id) && "bg-indigo-50/50"
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggleSelect(job.id, e)}
                  className="flex items-center justify-center text-gray-300 hover:text-indigo-600 transition-colors"
                >
                  {selected.has(job.id)
                    ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                    : <Square className="w-4 h-4" />}
                </button>

                {/* # */}
                <span className="text-xs font-mono text-gray-400">
                  {conceptNum ? String(conceptNum).padStart(3, "0") : "\u2014"}
                </span>

                {/* Thumbnail */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {(() => {
                    const thumbUrl = getConceptThumbnail(job);
                    return thumbUrl ? (
                      <img src={thumbUrl} alt={job.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-gray-300" />
                      </div>
                    );
                  })()}
                </div>

                {/* Name + Tags */}
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate block">{job.name}</span>
                  {(job.tags ?? []).length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {(job.tags ?? []).slice(0, 3).map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                      {(job.tags ?? []).length > 3 && (
                        <span className="text-xs text-gray-400">+{(job.tags ?? []).length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Product */}
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full text-center truncate">
                  {job.product ? (PRODUCTS.find((p) => p.value === job.product)?.label ?? job.product) : "\u2014"}
                </span>

                {/* Status badge */}
                <span className={`text-xs font-medium px-2 py-1 rounded-full text-center ${status.color}`}>
                  {status.label}
                </span>

                {/* Markets (deployment status per country) */}
                <div className="flex items-center gap-1.5">
                  {job.target_languages.map((lang) => {
                    const country = COUNTRY_MAP[lang];
                    const depStatus = marketStatus.get(country);
                    return (
                      <span key={country} className="relative inline-flex items-center" title={`${country}: ${depStatus === "pushed" ? "published" : depStatus === "pushing" ? "pushing" : depStatus === "error" ? "error" : "not deployed"}`}>
                        <span className={`text-sm ${!depStatus ? "opacity-30" : ""}`} role="img" aria-label={country}>{COUNTRY_FLAGS[country]}</span>
                        {depStatus && (
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                            depStatus === "pushed" ? "bg-emerald-500" : depStatus === "pushing" ? "bg-blue-500" : depStatus === "error" ? "bg-red-500" : "bg-gray-300"
                          }`} />
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Created */}
                <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>

                {/* Actions */}
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleArchive([job.id], showArchived ? "unarchive" : "archive");
                    }}
                    className="text-gray-300 hover:text-amber-500 p-1 transition-colors opacity-0 group-hover:opacity-100"
                    title={showArchived ? "Unarchive" : "Archive"}
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(job.id); }}
                    className="text-gray-300 hover:text-red-500 p-1 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              {totalCount} concepts
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setPage((p) => p - 1); fetchJobs(page - 1); }}
                disabled={page <= 1}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="text-xs text-gray-500 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { setPage((p) => p + 1); fetchJobs(page + 1); }}
                disabled={page >= totalPages}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      <NewConceptModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
        avgSecondsPerImage={avgSeconds}
      />

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
