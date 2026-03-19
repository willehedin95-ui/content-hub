"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import BoardFeed from "@/components/ad-spy/BoardFeed";
import SwipeQueue from "@/components/ad-spy/SwipeQueue";
import SwipeHistory from "@/components/ad-spy/SwipeHistory";
import DiscoveredFeed from "@/components/ad-spy/DiscoveredFeed";

type Tab = "board" | "discovered" | "queue" | "history";

const TABS: { value: Tab; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "discovered", label: "Discovered" },
  { value: "queue", label: "Queue" },
  { value: "history", label: "History" },
];

function AdSpyPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "board"
  );
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const urlTab = searchParams.get("tab") as Tab;
    if (TABS.some((t) => t.value === urlTab)) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    router.replace(`/ad-spy?tab=${tab}`, { scroll: false });
  }

  function handleSwipeBatch() {
    switchTab("queue");
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <Eye className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Ad Spy</h1>
          <p className="text-sm text-gray-500">Browse and swipe competitor ads from your GetHookd board</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => switchTab(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab.value
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
            {tab.value === "queue" && queueCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 rounded-full">
                {queueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "board" && (
        <BoardFeed onBatchSwipe={handleSwipeBatch} />
      )}
      {activeTab === "discovered" && (
        <DiscoveredFeed />
      )}
      {activeTab === "queue" && (
        <SwipeQueue onCountChange={setQueueCount} />
      )}
      {activeTab === "history" && (
        <SwipeHistory />
      )}
    </div>
  );
}

export default function AdSpyPage() {
  return (
    <Suspense>
      <AdSpyPageInner />
    </Suspense>
  );
}
