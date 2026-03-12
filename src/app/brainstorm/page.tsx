"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import BrainstormGenerate from "@/components/brainstorm/BrainstormGenerate";
import BrainstormQueue from "@/components/brainstorm/BrainstormQueue";
import HooksContent from "@/components/brainstorm/HooksContent";
import LearningsContent from "@/components/brainstorm/LearningsContent";

type Tab = "generate" | "queue" | "hooks" | "learnings";

const TABS: { value: Tab; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "queue", label: "Queue" },
  { value: "hooks", label: "Hooks" },
  { value: "learnings", label: "Learnings" },
];

function BrainstormPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "generate"
  );
  const [queueBadge, setQueueBadge] = useState(0);

  // Sync tab from URL changes
  useEffect(() => {
    const urlTab = searchParams.get("tab") as Tab;
    if (TABS.some((t) => t.value === urlTab)) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  // Poll badge count for Queue tab
  useEffect(() => {
    const fetchBadge = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/pipeline/badge-count");
        if (res.ok) {
          const d = await res.json();
          setQueueBadge(d.count || 0);
        }
      } catch {}
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 120_000);
    return () => clearInterval(interval);
  }, []);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    router.replace(`/brainstorm${tab === "generate" ? "" : `?tab=${tab}`}`, {
      scroll: false,
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Brainstorm</h1>
          <p className="text-sm text-gray-500">
            Generate ad concepts, review queue, hooks &amp; learnings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => switchTab(tab.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2",
              activeTab === tab.value
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
            {tab.value === "queue" && queueBadge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium tabular-nums">
                {queueBadge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "generate" && <BrainstormGenerate />}
      {activeTab === "queue" && <BrainstormQueue />}
      {activeTab === "hooks" && <HooksContent />}
      {activeTab === "learnings" && <LearningsContent />}
    </div>
  );
}

export default function BrainstormPage() {
  return (
    <Suspense>
      <BrainstormPageInner />
    </Suspense>
  );
}
