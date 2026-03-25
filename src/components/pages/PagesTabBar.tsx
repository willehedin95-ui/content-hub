"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "pages" | "ab-tests" | "swipe";

const TABS: { value: Tab; label: string; href: string }[] = [
  { value: "pages", label: "Pages", href: "/pages" },
  { value: "ab-tests", label: "A/B Tests", href: "/pages?tab=ab-tests" },
  { value: "swipe", label: "Swipe Page", href: "/pages?tab=swipe" },
];

export default function PagesTabBar({ activeTab }: { activeTab: Tab }) {
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
