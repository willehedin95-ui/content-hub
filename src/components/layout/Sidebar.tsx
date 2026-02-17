"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Layers, Settings, Zap, BarChart3, Image, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Landing pages", icon: Layers },
  { href: "/images", label: "Static ads", icon: Image },
  { href: "/ad-copy", label: "Ad copy", icon: MessageSquare },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Progress {
  processing: boolean;
  completed: number;
  total: number;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<Progress | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/image-jobs/progress");
      if (res.ok) setProgress(await res.json());
    } catch {
      // silently ignore
    }
  }, []);

  // Poll frequently while processing, slowly when idle (to detect new jobs)
  useEffect(() => {
    fetchProgress();
    const ms = progress?.processing ? 10_000 : 60_000;
    const interval = setInterval(fetchProgress, ms);
    return () => clearInterval(interval);
  }, [fetchProgress, progress?.processing]);

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              Content Hub
            </p>
            <p className="text-[10px] text-gray-400">Hälsobladet</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const showProgress =
            href === "/images" && progress?.processing && progress.total > 0;
          const pct =
            showProgress && progress
              ? Math.round((progress.completed / progress.total) * 100)
              : 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col gap-0.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-600 font-medium"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {showProgress && (
                  <span className="text-[10px] tabular-nums text-indigo-500">
                    {progress!.completed}/{progress!.total}
                  </span>
                )}
              </div>
              {showProgress && (
                <div className="ml-7 h-1 rounded-full bg-indigo-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200">
        <p className="text-[10px] text-gray-400">Content Hub v1.0</p>
      </div>
    </aside>
  );
}
