"use client";

import { useState, useEffect, useCallback } from "react";
import { Library, Plus, Loader2, Check, Archive, RotateCcw, Trash2, Pencil, X } from "lucide-react";
import { HookLibraryEntry, HookStatus, HookSource } from "@/types";
import { toast } from "sonner";

/* ── Filter option types ──────────────────────────── */

type ProductFilter = "all" | "happysleep" | "hydro13" | "universal";
type StatusFilter = "all" | HookStatus;
type SourceFilter = "all" | "manual" | "telegram" | "concept_auto" | "spy_ad";

const PRODUCT_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
  { value: "universal", label: "Universal" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "telegram", label: "Telegram" },
  { value: "concept_auto", label: "From Concepts" },
  { value: "spy_ad", label: "From Spy Ads" },
];

/* ── Helpers ──────────────────────────────────────── */

function productColor(product: string | null) {
  if (product === "happysleep") return "bg-sky-50 text-sky-700 border-sky-200";
  if (product === "hydro13") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function productLabel(product: string | null) {
  if (product === "happysleep") return "HappySleep";
  if (product === "hydro13") return "Hydro13";
  return "Universal";
}

function sourceLabel(s: HookSource) {
  const map: Record<HookSource, string> = {
    manual: "Manual",
    telegram: "Telegram",
    concept_auto: "From Concepts",
    spy_ad: "From Spy Ads",
  };
  return map[s] ?? s;
}

function statusBadge(s: HookStatus) {
  if (s === "unreviewed") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

/* ── Component ────────────────────────────────────── */

export default function HooksPage() {
  // Data
  const [hooks, setHooks] = useState<HookLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick-add form
  const [newText, setNewText] = useState("");
  const [newProduct, setNewProduct] = useState<ProductFilter>("all");
  const [adding, setAdding] = useState(false);

  // Filters
  const [filterProduct, setFilterProduct] = useState<ProductFilter>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");

  // Selection (bulk)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  /* ── Fetch ──────────────────────────────────────── */

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProduct !== "all") params.set("product", filterProduct);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterSource !== "all") params.set("source", filterSource);

      const res = await fetch(`/api/hooks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHooks(data.hooks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterProduct, filterStatus, filterSource]);

  useEffect(() => {
    fetchHooks();
  }, [fetchHooks]);

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [filterProduct, filterStatus, filterSource]);

  /* ── Quick-add ──────────────────────────────────── */

  async function handleAdd() {
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        hook_text: newText.trim(),
        source: "manual",
      };
      if (newProduct !== "all" && newProduct !== "universal") {
        body.product = newProduct;
      }
      // "universal" means product=null, which is the default

      const res = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setNewText("");
        toast.success("Hook added");
        fetchHooks();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add hook");
      }
    } finally {
      setAdding(false);
    }
  }

  /* ── Single actions ─────────────────────────────── */

  async function handleStatusChange(id: string, status: HookStatus) {
    const res = await fetch(`/api/hooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setHooks((prev) =>
        prev.map((h) => (h.id === id ? { ...h, status } : h))
      );
      toast.success(`Hook ${status}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this hook permanently?")) return;
    const res = await fetch(`/api/hooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setHooks((prev) => prev.filter((h) => h.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Hook deleted");
    }
  }

  async function handleEditSave(id: string) {
    if (!editText.trim()) return;
    const res = await fetch(`/api/hooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook_text: editText.trim() }),
    });
    if (res.ok) {
      setHooks((prev) =>
        prev.map((h) => (h.id === id ? { ...h, hook_text: editText.trim() } : h))
      );
      setEditingId(null);
      toast.success("Hook updated");
    }
  }

  /* ── Bulk actions ───────────────────────────────── */

  async function handleBulk(action: "approve" | "archive") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const res = await fetch("/api/hooks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (res.ok) {
      const newStatus: HookStatus = action === "approve" ? "approved" : "archived";
      setHooks((prev) =>
        prev.map((h) =>
          selected.has(h.id) ? { ...h, status: newStatus } : h
        )
      );
      setSelected(new Set());
      toast.success(`${ids.length} hook${ids.length !== 1 ? "s" : ""} ${newStatus}`);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === hooks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(hooks.map((h) => h.id)));
    }
  }

  /* ── Counts ─────────────────────────────────────── */

  const counts = {
    total: hooks.length,
    unreviewed: hooks.filter((h) => h.status === "unreviewed").length,
    approved: hooks.filter((h) => h.status === "approved").length,
    archived: hooks.filter((h) => h.status === "archived").length,
  };

  /* ── Render ─────────────────────────────────────── */

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Library className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hook Bank</h1>
          <p className="text-sm text-gray-500">
            {counts.total} hook{counts.total !== 1 ? "s" : ""}
            {counts.total > 0 && (
              <span className="ml-2">
                <span className="text-amber-600">{counts.unreviewed} unreviewed</span>
                {" / "}
                <span className="text-emerald-600">{counts.approved} approved</span>
                {" / "}
                <span className="text-gray-400">{counts.archived} archived</span>
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Quick-add bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Add a hook or headline..."
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
          <select
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value as ProductFilter)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {PRODUCT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!newText.trim() || adding}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
        {/* Product */}
        <FilterRow label="Product">
          {PRODUCT_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              active={filterProduct === o.value}
              onClick={() => setFilterProduct(o.value)}
            >
              {o.label}
            </FilterChip>
          ))}
        </FilterRow>

        {/* Status */}
        <FilterRow label="Status">
          {STATUS_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              active={filterStatus === o.value}
              onClick={() => setFilterStatus(o.value)}
            >
              {o.label}
            </FilterChip>
          ))}
        </FilterRow>

        {/* Source */}
        <FilterRow label="Source">
          {SOURCE_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              active={filterSource === o.value}
              onClick={() => setFilterSource(o.value)}
            >
              {o.label}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && hooks.length === 0 && (
        <div className="text-center py-20">
          <Library className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No hooks yet. Add your first hook above or send one via Telegram.
          </p>
        </div>
      )}

      {/* Hook list */}
      {!loading && hooks.length > 0 && (
        <div className="space-y-2">
          {/* Select all row */}
          <div className="flex items-center gap-2 px-2 py-1">
            <input
              type="checkbox"
              checked={selected.size === hooks.length && hooks.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-400">
              {selected.size > 0
                ? `${selected.size} selected`
                : "Select all"}
            </span>
          </div>

          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(hook.id)}
                  onChange={() => toggleSelect(hook.id)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1 shrink-0"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Hook text or edit input */}
                  {editingId === hook.id ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave(hook.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <button
                        onClick={() => handleEditSave(hook.id)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-base font-medium text-gray-900 mb-2 cursor-pointer hover:text-indigo-700 transition-colors"
                      onClick={() => {
                        setEditingId(hook.id);
                        setEditText(hook.hook_text);
                      }}
                      title="Click to edit"
                    >
                      {hook.hook_text}
                    </p>
                  )}

                  {/* Chips row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Product */}
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border ${productColor(
                        hook.product
                      )}`}
                    >
                      {productLabel(hook.product)}
                    </span>

                    {/* Source */}
                    <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                      {sourceLabel(hook.source)}
                    </span>

                    {/* Awareness level */}
                    {hook.awareness_level && (
                      <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                        {hook.awareness_level}
                      </span>
                    )}

                    {/* Angle */}
                    {hook.angle && (
                      <span className="text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200">
                        {hook.angle}
                      </span>
                    )}

                    {/* Status badge */}
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border ${statusBadge(
                        hook.status
                      )}`}
                    >
                      {hook.status}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Edit */}
                  {editingId !== hook.id && (
                    <button
                      onClick={() => {
                        setEditingId(hook.id);
                        setEditText(hook.hook_text);
                      }}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Approve (only for unreviewed) */}
                  {hook.status === "unreviewed" && (
                    <button
                      onClick={() => handleStatusChange(hook.id, "approved")}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Archive / Restore */}
                  {hook.status !== "archived" ? (
                    <button
                      onClick={() => handleStatusChange(hook.id, "archived")}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Archive"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(hook.id, "approved")}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(hook.id)}
                    className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl shadow-xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <button
            onClick={() => handleBulk("approve")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Approve All
          </button>
          <button
            onClick={() => handleBulk("archive")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            Archive All
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Reusable filter components ───────────────────── */

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-500 w-16 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
        active
          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
          : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
