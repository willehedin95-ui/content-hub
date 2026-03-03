"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import SpyDashboard from "@/components/spy/SpyDashboard";
import SavedAdsDashboard from "@/components/saved-ads/SavedAdsDashboard";

type Tab = "scraped" | "saved";

function AdLibraryInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "scraped"
  );
  const deepLinkId = searchParams.get("id");

  // Sync tab from URL changes
  useEffect(() => {
    const urlTab = searchParams.get("tab") as Tab;
    if (urlTab === "scraped" || urlTab === "saved") {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    router.replace(`/ad-library?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Eye className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Ad Library</h1>
          <p className="text-sm text-gray-500">
            Monitor competitors and review saved ad inspiration
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => switchTab("scraped")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "scraped"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Scraped (Meta)
        </button>
        <button
          onClick={() => switchTab("saved")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "saved"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Saved (Telegram)
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "scraped" && <SpyDashboard hideHeader />}
      {activeTab === "saved" && (
        <SavedAdsDashboard hideHeader deepLinkId={deepLinkId} />
      )}
    </div>
  );
}

export default function AdLibraryPage() {
  return (
    <Suspense>
      <AdLibraryInner />
    </Suspense>
  );
}
