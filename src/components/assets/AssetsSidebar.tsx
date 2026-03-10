"use client";

import { useState, useEffect } from "react";
import { ImageIcon, Film, Sparkles, Scissors, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

export type AssetView = "images" | "videos" | "swipe-image" | "swipe-video";

interface Props {
  activeView: AssetView;
  onViewChange: (view: AssetView) => void;
  activeProduct: Product | "all" | "general";
  onProductChange: (product: Product | "all" | "general") => void;
  counts: { images: number; videos: number };
}

const LIBRARY_ITEMS: { view: AssetView; label: string; icon: typeof ImageIcon }[] = [
  { view: "images", label: "Images", icon: ImageIcon },
  { view: "videos", label: "Videos", icon: Film },
];

const TOOL_ITEMS: { view: AssetView; label: string; icon: typeof Sparkles }[] = [
  { view: "swipe-image", label: "Swipe Image", icon: Sparkles },
  { view: "swipe-video", label: "Swipe Video", icon: Scissors },
];

const PRODUCT_ITEMS: { value: Product | "all" | "general"; label: string }[] = [
  { value: "all", label: "All Products" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
  { value: "general", label: "General" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function StorageBar() {
  const [usage, setUsage] = useState<{
    total_bytes: number;
    limit_bytes: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/storage/usage")
      .then((r) => r.json())
      .then((data) => {
        if (data.total_bytes !== undefined) setUsage(data);
      })
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const pct = Math.min((usage.total_bytes / usage.limit_bytes) * 100, 100);
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="pt-4 border-t border-gray-200">
      <div className="flex items-center gap-1.5 mb-2">
        <HardDrive className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-500">Storage</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        {formatBytes(usage.total_bytes)} of {formatBytes(usage.limit_bytes)} used
      </p>
    </div>
  );
}

export default function AssetsSidebar({
  activeView,
  onViewChange,
  activeProduct,
  onProductChange,
  counts,
}: Props) {
  return (
    <div className="w-52 shrink-0 border-r border-gray-200 bg-gray-50/50 p-4 flex flex-col overflow-y-auto">
      <div className="space-y-6">
      {/* Library Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Library
        </h3>
        <div className="space-y-0.5">
          {LIBRARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.view;
            const count = item.view === "images" ? counts.images : counts.videos;

            return (
              <button
                key={item.view}
                onClick={() => onViewChange(item.view)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isActive ? "text-indigo-500" : "text-gray-400"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tools Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Tools
        </h3>
        <div className="space-y-0.5">
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.view;

            return (
              <button
                key={item.view}
                onClick={() => onViewChange(item.view)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Filter Section */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Product Filter
        </h3>
        <div className="space-y-0.5">
          {PRODUCT_ITEMS.map((item) => {
            const isActive = activeProduct === item.value;

            return (
              <button
                key={item.value}
                onClick={() => onProductChange(item.value)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>

      {/* Spacer + Storage */}
      <div className="flex-1" />
      <StorageBar />
    </div>
  );
}
