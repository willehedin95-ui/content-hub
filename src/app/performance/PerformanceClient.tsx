"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, Crosshair } from "lucide-react";
import PageAnalyticsClient from "@/app/analytics/PageAnalyticsClient";
import TrackingClient from "@/app/tracking/TrackingClient";
import AttributionClient from "@/app/attribution/AttributionClient";

const TABS = [
  { id: "pages" as const, label: "Page Analytics", icon: BarChart3 },
  { id: "campaigns" as const, label: "Campaign Tracking", icon: TrendingUp },
  { id: "attribution" as const, label: "Attribution", icon: Crosshair },
];

type TabId = (typeof TABS)[number]["id"];

export default function PerformanceClient({
  pageAnalyticsConfig,
  campaignTrackingConfig,
}: {
  pageAnalyticsConfig: {
    ga4Configured: boolean;
    clarityConfigured: boolean;
    shopifyConfigured: boolean;
    metaConfigured: boolean;
  };
  campaignTrackingConfig: {
    metaConfigured: boolean;
    shopifyConfigured: boolean;
    ga4Configured: boolean;
    clarityConfigured: boolean;
    googleAdsConfigured: boolean;
  };
}) {
  const [activeTab, setActiveTab] = useState<TabId>("pages");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "pages" && (
        <PageAnalyticsClient
          ga4Configured={pageAnalyticsConfig.ga4Configured}
          clarityConfigured={pageAnalyticsConfig.clarityConfigured}
          shopifyConfigured={pageAnalyticsConfig.shopifyConfigured}
          metaConfigured={pageAnalyticsConfig.metaConfigured}
        />
      )}

      {activeTab === "campaigns" && (
        <TrackingClient
          metaConfigured={campaignTrackingConfig.metaConfigured}
          shopifyConfigured={campaignTrackingConfig.shopifyConfigured}
          ga4Configured={campaignTrackingConfig.ga4Configured}
          clarityConfigured={campaignTrackingConfig.clarityConfigured}
          googleAdsConfigured={campaignTrackingConfig.googleAdsConfigured}
        />
      )}

      {activeTab === "attribution" && <AttributionClient />}
    </div>
  );
}
