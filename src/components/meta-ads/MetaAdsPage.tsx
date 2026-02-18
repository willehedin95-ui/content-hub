"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Megaphone,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { MetaCampaign, LANGUAGES } from "@/types";
import AdSetBuilder from "./AdSetBuilder";

interface Props {
  initialCampaigns: MetaCampaign[];
}

export default function MetaAdsPage({ initialCampaigns }: Props) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showBuilder, setShowBuilder] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  async function handlePush(campaignId: string) {
    setPushing(campaignId);
    setPushError(null);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaignId}/push`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPushError(data.error ?? "Push failed");
      }
      router.refresh();
      // Refresh campaigns list
      const listRes = await fetch("/api/meta/campaigns");
      if (listRes.ok) setCampaigns(await listRes.json());
    } finally {
      setPushing(null);
    }
  }

  function handleCreated() {
    setShowBuilder(false);
    router.refresh();
    fetch("/api/meta/campaigns")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to refresh campaigns");
        return r.json();
      })
      .then(setCampaigns)
      .catch(() => setPushError("Ad set created, but failed to refresh the list. Reload the page."));
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meta Ads</h1>
          <p className="text-sm text-gray-400 mt-1">
            Push translated ads directly to Meta Ads Manager
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Ad Set
        </button>
      </div>

      {pushError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {pushError}
        </p>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No ad sets yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Create an ad set to push your translated ads to Meta.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const langInfo = LANGUAGES.find((l) => l.value === campaign.language);
            const adCount = campaign.meta_ads?.length ?? 0;
            const pushedCount = campaign.meta_ads?.filter((a) => a.status === "pushed").length ?? 0;
            const errorCount = campaign.meta_ads?.filter((a) => a.status === "error").length ?? 0;
            const isPushing = pushing === campaign.id;

            return (
              <div
                key={campaign.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={campaign.status} />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {campaign.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {langInfo?.flag} {langInfo?.label}
                        </span>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="text-xs text-gray-400">
                          {adCount} ad{adCount !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="text-xs text-gray-400">
                          ${(campaign.daily_budget / 100).toFixed(2)}/day
                        </span>
                        {pushedCount > 0 && (
                          <>
                            <span className="text-xs text-gray-300">|</span>
                            <span className="text-xs text-emerald-600">
                              {pushedCount} pushed
                            </span>
                          </>
                        )}
                        {errorCount > 0 && (
                          <>
                            <span className="text-xs text-gray-300">|</span>
                            <span className="text-xs text-red-600">
                              {errorCount} failed
                            </span>
                          </>
                        )}
                        {campaign.start_time && (
                          <>
                            <span className="text-xs text-gray-300">|</span>
                            <span className="text-xs text-gray-400">
                              {new Date(campaign.start_time).toLocaleDateString()}
                              {campaign.end_time
                                ? ` → ${new Date(campaign.end_time).toLocaleDateString()}`
                                : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {campaign.status === "pushed" && campaign.meta_campaign_id && (
                      <a
                        href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID}&campaign_ids=${campaign.meta_campaign_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View in Meta
                      </a>
                    )}
                    {campaign.status === "draft" && (
                      <button
                        onClick={() => handlePush(campaign.id)}
                        disabled={isPushing}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {isPushing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Megaphone className="w-3.5 h-3.5" />
                        )}
                        {isPushing ? "Pushing..." : "Push to Meta"}
                      </button>
                    )}
                    {campaign.status === "error" && (
                      <button
                        onClick={() => handlePush(campaign.id)}
                        disabled={isPushing}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {isPushing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Megaphone className="w-3.5 h-3.5" />
                        )}
                        Retry Push
                      </button>
                    )}
                  </div>
                </div>

                {/* Show error message if any */}
                {campaign.error_message && (
                  <p className="text-xs text-red-500 mt-2 bg-red-50 rounded px-2 py-1">
                    {campaign.error_message}
                  </p>
                )}

                {/* Ad details for pushed campaigns */}
                {campaign.status === "pushed" && campaign.meta_ads && campaign.meta_ads.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-2">
                      {campaign.meta_ads.map((ad) => (
                        <div
                          key={ad.id}
                          className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2"
                        >
                          {ad.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.image_url}
                              alt=""
                              className="w-8 h-8 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-gray-700">{ad.name}</p>
                            {ad.headline && (
                              <p className="truncate text-gray-500 font-medium">{ad.headline}</p>
                            )}
                            {ad.ad_copy && (
                              <p className="truncate text-gray-400">{ad.ad_copy.slice(0, 60)}</p>
                            )}
                          </div>
                          {ad.status === "pushed" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : ad.status === "error" ? (
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showBuilder && (
        <AdSetBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pushed":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          Pushed
        </span>
      );
    case "pushing":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          Pushing
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          Draft
        </span>
      );
  }
}
