"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, ChevronRight, AlertCircle, X, Search, Loader2 } from "lucide-react";
import { Page, Translation, LANGUAGES, PAGE_TYPES } from "@/types";
import { useProducts } from "@/hooks/useProducts";
import { TagBadge } from "@/components/ui/tag-input";
import { useAllTags } from "@/lib/hooks/use-all-tags";
import StatusDot from "./StatusDot";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_MAP = Object.fromEntries(PAGE_TYPES.map((t) => [t.value, t.label]));

function getTranslationStatus(
  translations: Translation[],
  lang: string
): "none" | Translation["status"] {
  const t = translations?.find((t) => t.language === lang);
  return t ? t.status : "none";
}

function getTranslationUrl(translations: Translation[], lang: string) {
  return translations?.find((t) => t.language === lang)?.published_url;
}

export default function PagesTable({ pages, onImport }: { pages: Page[]; onImport?: () => void }) {
  const products = useProducts();
  const PRODUCT_MAP = useMemo(() => Object.fromEntries(products.map((p) => [p.value, p.label])), [products]);
  const router = useRouter();
  const [filter, setFilter] = useState({ product: "", type: "", search: "", tag: "" });
  const { tags: allTags } = useAllTags();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  // Auto-dismiss delete error after 8 seconds
  useEffect(() => {
    if (!deleteError) return;
    const t = setTimeout(() => setDeleteError(""), 8000);
    return () => clearTimeout(t);
  }, [deleteError]);

  const filtered = useMemo(
    () =>
      pages.filter((p) => {
        if (filter.product && p.product !== filter.product) return false;
        if (filter.type && p.page_type !== filter.type) return false;
        if (filter.tag && !(p.tags ?? []).includes(filter.tag)) return false;
        if (
          filter.search &&
          !p.name.toLowerCase().includes(filter.search.toLowerCase())
        )
          return false;
        return true;
      }),
    [pages, filter]
  );

  async function handleDelete(id: string) {
    setConfirmDelete(null);
    setDeleting(id);
    setDeleteError("");

    try {
      const res = await fetch(`/api/pages/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete page");
        return;
      }
      router.refresh();
    } catch {
      setDeleteError("Failed to delete — check your connection");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter.search}
            onChange={(e) =>
              setFilter((f) => ({ ...f, search: e.target.value }))
            }
            placeholder="Search pages..."
            className="pl-9 w-56"
          />
        </div>

        <Select
          value={filter.product || "__all__"}
          onValueChange={(v) => setFilter((f) => ({ ...f, product: v === "__all__" ? "" : v }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filter.type || "__all__"}
          onValueChange={(v) => setFilter((f) => ({ ...f, type: v === "__all__" ? "" : v }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {PAGE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {allTags.length > 0 && (
          <Select
            value={filter.tag || "__all__"}
            onValueChange={(v) => setFilter((f) => ({ ...f, tag: v === "__all__" ? "" : v }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <span className="text-muted-foreground text-sm ml-auto tabular-nums">
          {filtered.length} page{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Delete error */}
      {deleteError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{deleteError}</span>
          <button onClick={() => setDeleteError("")} className="text-destructive/60 hover:text-destructive shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">
                Name
              </th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">
                Product
              </th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">
                Type
              </th>
              {LANGUAGES.map((l) => (
                <th
                  key={l.value}
                  className="text-center px-4 py-3 text-muted-foreground font-medium"
                >
                  <span role="img" aria-label={l.label}>{l.flag}</span>
                </th>
              ))}
              <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">
                Created
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7 + LANGUAGES.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {pages.length === 0 ? (
                    <>
                      No pages yet.{" "}
                      <button
                        onClick={onImport}
                        className="text-primary hover:underline"
                      >
                        Import your first page &rarr;
                      </button>
                    </>
                  ) : (
                    <>
                      No pages match your filters.{" "}
                      <button
                        onClick={() =>
                          setFilter({ product: "", type: "", search: "", tag: "" })
                        }
                        className="text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((page) => (
              <tr
                key={page.id}
                className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/pages/${page.id}`)}
              >
                <td className="px-4 py-3">
                  <div>
                    <span className="text-foreground font-medium">{page.name}</span>
                    {(page.tags ?? []).length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {(page.tags ?? []).map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground capitalize">
                    {PRODUCT_MAP[page.product]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground capitalize">
                    {TYPE_MAP[page.page_type]}
                  </span>
                </td>
                {LANGUAGES.map((l) => {
                  const isImporting = (page as Page & { status?: string }).status === "importing";
                  if (isImporting) {
                    return (
                      <td key={l.value} className="px-4 py-3 text-center">
                        {l === LANGUAGES[0] ? (
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-600">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Importing
                          </span>
                        ) : null}
                      </td>
                    );
                  }
                  const status = getTranslationStatus(
                    page.translations || [],
                    l.value
                  );
                  const url = getTranslationUrl(page.translations || [], l.value);
                  return (
                    <td key={l.value} className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusDot status={status} />
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(page.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ id: page.id, name: page.name });
                      }}
                      disabled={deleting === page.id}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Status legend */}
      <div className="flex items-center gap-4 mt-3 px-1">
        {([
          { color: "bg-gray-300", label: "Not started" },
          { color: "bg-indigo-500 animate-pulse", label: "Importing" },
          { color: "bg-yellow-400", label: "Translating" },
          { color: "bg-blue-500", label: "Translated" },
          { color: "bg-emerald-500", label: "Published" },
          { color: "bg-red-500", label: "Error" },
        ] as const).map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete page"
        message={confirmDelete ? `Delete "${confirmDelete.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
