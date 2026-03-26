"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type AppAnalyticsTab = "overview" | "engagement" | "onboarding" | "challenges" | "features";

const TABS: { value: AppAnalyticsTab; label: string; href: string }[] = [
  { value: "overview", label: "Overview", href: "/app-analytics" },
  { value: "engagement", label: "Engagement", href: "/app-analytics?tab=engagement" },
  { value: "onboarding", label: "Onboarding", href: "/app-analytics?tab=onboarding" },
  { value: "challenges", label: "Challenges", href: "/app-analytics?tab=challenges" },
  { value: "features", label: "Features", href: "/app-analytics?tab=features" },
];

export default function AppAnalyticsTabBar({ activeTab }: { activeTab: AppAnalyticsTab }) {
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
              : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
