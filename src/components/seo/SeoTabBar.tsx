"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type SeoTab = "dashboard" | "articles" | "content-plan" | "gap-keywords" | "speed" | "settings";

const TABS: { value: SeoTab; label: string; href: string }[] = [
  { value: "dashboard", label: "Dashboard", href: "/seo" },
  { value: "articles", label: "Articles", href: "/seo?tab=articles" },
  { value: "content-plan", label: "Content Plan", href: "/seo?tab=content-plan" },
  { value: "gap-keywords", label: "Gap Keywords", href: "/seo?tab=gap-keywords" },
  { value: "speed", label: "Speed", href: "/seo?tab=speed" },
  { value: "settings", label: "Settings", href: "/seo?tab=settings" },
];

export default function SeoTabBar({ activeTab }: { activeTab: SeoTab }) {
  return (
    <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === tab.value
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
