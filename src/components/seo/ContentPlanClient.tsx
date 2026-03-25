"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  FileText,
  CheckCircle,
  Clock,
  Pause,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentPlanItem {
  id: string;
  language: string;
  slug: string;
  title: string;
  category: string;
  template_id: string;
  primary_keyword: string;
  secondary_keywords: string[];
  word_count: string;
  content_brief: string | null;
  product_slug: string;
  priority: number;
  status: "planned" | "writing" | "published" | "deferred";
  source: "manual" | "autopilot_research" | "gsc_opportunity";
  page_id: string | null;
  published_at: string | null;
  created_at: string;
}

type Language = "sv" | "da" | "no";
type StatusFilter = "all" | "planned" | "published" | "deferred";

const LANG_TABS: { value: Language; label: string; flag: string }[] = [
  { value: "sv", label: "Swedish", flag: "\u{1F1F8}\u{1F1EA}" },
  { value: "da", label: "Danish", flag: "\u{1F1E9}\u{1F1F0}" },
  { value: "no", label: "Norwegian", flag: "\u{1F1F3}\u{1F1F4}" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "planned", label: "Planned" },
  { value: "published", label: "Published" },
  { value: "deferred", label: "Deferred" },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "published":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "writing":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "deferred":
      return <Pause className="w-4 h-4 text-amber-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planned: "bg-gray-100 text-gray-700",
    writing: "bg-blue-100 text-blue-700",
    published: "bg-green-100 text-green-700",
    deferred: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", colors[status] || colors.planned)}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "manual") return null;
  const label = source === "autopilot_research" ? "Auto-discovered" : "GSC opportunity";
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 flex items-center gap-1">
      <Sparkles className="w-3 h-3" />
      {label}
    </span>
  );
}

export default function ContentPlanClient() {
  const [allItems, setAllItems] = useState<ContentPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>("sv");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Always fetch ALL items for the language (filter client-side for display)
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/seo/content-plan?language=${language}`);
      if (res.ok) {
        setAllItems(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Client-side filter for display
  const displayItems = useMemo(() => {
    if (statusFilter === "all") return allItems;
    return allItems.filter((i) => i.status === statusFilter);
  }, [allItems, statusFilter]);

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/seo/content-plan/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setAllItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: newStatus as ContentPlanItem["status"] } : item))
        );
      }
    } finally {
      setUpdating(null);
    }
  };

  const updatePriority = async (id: string, direction: "up" | "down") => {
    setUpdating(id);
    try {
      const item = allItems.find((i) => i.id === id);
      if (!item) return;
      const newPriority = direction === "up" ? item.priority + 10 : Math.max(0, item.priority - 10);
      const res = await fetch(`/api/seo/content-plan/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) {
        await fetchItems();
      }
    } finally {
      setUpdating(null);
    }
  };

  // Stats always from ALL items (not filtered subset)
  const planned = allItems.filter((i) => i.status === "planned").length;
  const published = allItems.filter((i) => i.status === "published").length;
  const deferred = allItems.filter((i) => i.status === "deferred").length;
  const total = allItems.length;

  return (
    <div className="space-y-4">
      {/* Language tabs + status filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {LANG_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setLanguage(tab.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                language === tab.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              )}
            >
              {tab.flag} {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-colors",
                statusFilter === f.value
                  ? "bg-gray-200 text-gray-800 font-medium"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="ml-1 text-gray-400">
                  {f.value === "planned" ? planned : f.value === "published" ? published : deferred}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{total} total</span>
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {planned} planned</span>
        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {published} published</span>
        {deferred > 0 && (
          <span className="flex items-center gap-1"><Pause className="w-3 h-3 text-amber-500" /> {deferred} deferred</span>
        )}
      </div>

      {/* Content plan list */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {statusFilter !== "all" ? `No ${statusFilter} articles` : "No Content Plan Items"}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {statusFilter !== "all"
              ? `No ${statusFilter} articles for ${LANG_TABS.find((l) => l.value === language)?.label ?? language}. Try a different filter.`
              : `No articles planned for ${LANG_TABS.find((l) => l.value === language)?.label ?? language} yet.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600 w-8">#</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Article</th>
                <th className="text-left py-3 px-3 font-medium text-gray-600 w-36">Keyword</th>
                <th className="text-center py-3 px-3 font-medium text-gray-600 w-24">Status</th>
                <th className="text-center py-3 px-3 font-medium text-gray-600 w-20">Priority</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, idx) => (
                <ContentPlanRow
                  key={item.id}
                  item={item}
                  index={idx + 1}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onUpdateStatus={updateStatus}
                  onUpdatePriority={updatePriority}
                  updating={updating === item.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContentPlanRow({
  item,
  index,
  expanded,
  onToggle,
  onUpdateStatus,
  onUpdatePriority,
  updating,
}: {
  item: ContentPlanItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdatePriority: (id: string, direction: "up" | "down") => void;
  updating: boolean;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors",
          item.status === "deferred" && "opacity-60"
        )}
        onClick={onToggle}
      >
        <td className="py-3 px-4 text-gray-400 tabular-nums text-xs">{index}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <StatusIcon status={item.status} />
            <div>
              <div className="font-medium text-gray-900 text-sm">{item.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">/{item.slug}</span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.category}</span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.template_id}</span>
                <SourceBadge source={item.source} />
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-3">
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Search className="w-3 h-3 text-gray-400" />
            {item.primary_keyword}
          </div>
        </td>
        <td className="text-center py-3 px-3">
          <StatusBadge status={item.status} />
        </td>
        <td className="text-center py-3 px-3">
          {item.status === "planned" && (
            <div className="flex items-center justify-center gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); onUpdatePriority(item.id, "up"); }}
                disabled={updating}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Increase priority"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-gray-500 tabular-nums w-6 text-center">{item.priority}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdatePriority(item.id, "down"); }}
                disabled={updating}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Decrease priority"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
        <td className="py-3 px-3 text-right">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50 px-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-gray-500 font-medium mb-1">Details</div>
                <div className="space-y-1 text-gray-700">
                  <p>Target: ~{item.word_count} words</p>
                  {item.product_slug && <p>Product: {item.product_slug}</p>}
                  {item.content_brief && <p className="leading-relaxed mt-1">{item.content_brief}</p>}
                </div>
              </div>
              <div>
                <div className="text-gray-500 font-medium mb-1">Keywords</div>
                <div className="flex flex-wrap gap-1">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-medium">
                    {item.primary_keyword}
                  </span>
                  {item.secondary_keywords.map((kw) => (
                    <span key={kw} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px]">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-200">
              {item.status === "planned" && (
                <button
                  onClick={() => onUpdateStatus(item.id, "deferred")}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                >
                  Defer
                </button>
              )}
              {item.status === "deferred" && (
                <button
                  onClick={() => onUpdateStatus(item.id, "planned")}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                >
                  Reactivate
                </button>
              )}
              {item.page_id && (
                <a
                  href={`/pages/${item.page_id}/edit/${item.language}/`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Pencil className="w-3 h-3" /> Edit in Builder
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
