import { getWorkspaceSettings } from "@/lib/workspace";
import AppAnalyticsTabBar, {
  type AppAnalyticsTab,
} from "@/components/app-analytics/AppAnalyticsTabBar";
import OverviewDashboard from "@/components/app-analytics/OverviewDashboard";
import EngagementSection from "@/components/app-analytics/EngagementSection";
import OnboardingSection from "@/components/app-analytics/OnboardingSection";
import ChallengeSection from "@/components/app-analytics/ChallengeSection";
import FeatureSection from "@/components/app-analytics/FeatureSection";
import Link from "next/link";
import { Smartphone, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AppAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: AppAnalyticsTab = (tab as AppAnalyticsTab) || "overview";
  const settings = await getWorkspaceSettings();
  const appId = settings?.telemetrydeck_app_id;

  if (!appId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">App Analytics Not Configured</h2>
        <p className="text-gray-500 mb-6">
          Connect your TelemetryDeck app to see analytics here. Add your TelemetryDeck App ID in
          workspace settings.
        </p>
        <Link
          href="/settings?tab=integrations"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          <Settings className="w-4 h-4" />
          Go to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">App Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          iOS app usage data from TelemetryDeck
        </p>
      </div>
      <AppAnalyticsTabBar activeTab={activeTab} />
      {activeTab === "overview" && <OverviewDashboard />}
      {activeTab === "engagement" && <EngagementSection />}
      {activeTab === "onboarding" && <OnboardingSection />}
      {activeTab === "challenges" && <ChallengeSection />}
      {activeTab === "features" && <FeatureSection />}
    </div>
  );
}
