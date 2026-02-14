"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, ChevronRight } from "lucide-react";
import { Page, Translation, LANGUAGES, PRODUCTS, PAGE_TYPES } from "@/types";
import StatusDot from "./StatusDot";

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

export default function PagesTable({ pages }: { pages: Page[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState({ product: "", type: "" });
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = pages.filter((p) => {
    if (filter.product && p.product !== filter.product) return false;
    if (filter.type && p.page_type !== filter.type) return false;
    return true;
  });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch(`/api/pages/${id}`, { method: "DELETE" });
    router.refresh();
    setDeleting(null);
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={filter.product}
          onChange={(e) => setFilter((f) => ({ ...f, product: e.target.value }))}
          className="bg-[#141620] border border-[#1e2130] text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Products</option>
          {PRODUCTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={filter.type}
          onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
          className="bg-[#141620] border border-[#1e2130] text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Types</option>
          {PAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <span className="text-slate-500 text-sm ml-auto">
          {filtered.length} page{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#141620] border-b border-[#1e2130]">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">
                Name
              </th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">
                Product
              </th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">
                Type
              </th>
              {LANGUAGES.map((l) => (
                <th
                  key={l.value}
                  className="text-center px-4 py-3 text-slate-400 font-medium"
                >
                  {l.flag}
                </th>
              ))}
              <th className="text-left px-4 py-3 text-slate-400 font-medium">
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
                  className="px-4 py-12 text-center text-slate-500"
                >
                  No pages yet.{" "}
                  <Link href="/import" className="text-indigo-400 hover:underline">
                    Import your first page →
                  </Link>
                </td>
              </tr>
            )}
            {filtered.map((page) => (
              <tr
                key={page.id}
                className="border-b border-[#1e2130] hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => router.push(`/pages/${page.id}`)}
              >
                <td className="px-4 py-3">
                  <span className="text-slate-200 font-medium">{page.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-400 capitalize">
                    {PRODUCTS.find((p) => p.value === page.product)?.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-400 capitalize">
                    {PAGE_TYPES.find((t) => t.value === page.page_type)?.label}
                  </span>
                </td>
                {LANGUAGES.map((l) => {
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
                            className="text-slate-500 hover:text-indigo-400"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(page.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(page.id, page.name);
                      }}
                      disabled={deleting === page.id}
                      className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
