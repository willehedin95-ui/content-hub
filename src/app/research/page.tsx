import ResearchTabBar, { type ResearchTab } from "@/components/research/ResearchTabBar";
import ResearchFeed from "@/components/research/ResearchFeed";
import ResearchThemes from "@/components/research/ResearchThemes";
import ResearchSources from "@/components/research/ResearchSources";

export const dynamic = "force-dynamic";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: ResearchTab = (tab as ResearchTab) || "feed";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">Research</h1>
        <p className="text-sm text-gray-500 mt-1">
          Automated customer intelligence from Trustpilot reviews. Real language, pain points, and competitor insights for your marketing.
        </p>
      </div>

      <ResearchTabBar activeTab={activeTab} />

      {activeTab === "feed" && <ResearchFeed />}
      {activeTab === "themes" && <ResearchThemes />}
      {activeTab === "sources" && <ResearchSources />}
    </div>
  );
}
