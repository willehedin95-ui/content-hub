"use client";

import {
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { LANGUAGES, PRODUCTS, COUNTRY_MAP, MetaCampaignMapping, MetaPageConfig, MarketProductUrl } from "@/types";
import Dropdown from "@/components/ui/dropdown";
import {
  SettingsCard,
  SectionHeader,
  RowDivider,
} from "../components";

interface MarketsTabProps {
  mappings: {
    campaignMappings: MetaCampaignMapping[];
    metaCampaigns: { id: string; name: string; status: string; objective: string }[];
    loading: boolean;
    saving: string | null;
  };
  marketUrls: {
    urls: MarketProductUrl[];
    saving: string | null;
    drafts: Record<string, string>;
  };
  pageConfigs: {
    configs: MetaPageConfig[];
    saving: string | null;
  };
  adSets: {
    byCampaign: Record<string, { id: string; name: string; status: string }[]>;
    loading: string | null;
  };
  metaPages: {
    pages: { id: string; name: string }[];
    loading: boolean;
  };
  setMarketUrls: React.Dispatch<React.SetStateAction<MarketsTabProps["marketUrls"]>>;
  handleMarketUrlSave: (product: string, country: string, url: string) => void;
  fetchMetaPages: () => void;
  handlePageConfigChange: (country: string, metaPageId: string) => void;
  handleMappingChange: (product: string, country: string, metaCampaignId: string) => void;
  fetchAdSetsForCampaign: (metaCampaignId: string) => void;
  handleTemplateAdSetChange: (product: string, country: string, adSetId: string) => void;
}

export default function MarketsTab({
  mappings,
  marketUrls,
  pageConfigs,
  adSets,
  metaPages,
  setMarketUrls,
  handleMarketUrlSave,
  fetchMetaPages,
  handlePageConfigChange,
  handleMappingChange,
  fetchAdSetsForCampaign,
  handleTemplateAdSetChange,
}: MarketsTabProps) {
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Markets</h2>
      {mappings.loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-6">
          {LANGUAGES.filter((l) => l.domain).map((lang) => {
            const country = COUNTRY_MAP[lang.value];
            return (
              <div key={lang.value}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg" role="img" aria-label={lang.label}>{lang.flag}</span>
                  <h3 className="text-sm font-semibold text-gray-900">{country} — {lang.label}</h3>
                </div>

                {/* Product URLs */}
                <SectionHeader>Product URLs</SectionHeader>
                <SettingsCard>
                  {PRODUCTS.map((prod, i) => {
                    const cellKey = `${prod.value}-${country}`;
                    const existing = marketUrls.urls.find((u) => u.product === prod.value && u.country === country);
                    const draft = marketUrls.drafts[cellKey];
                    const value = draft !== undefined ? draft : existing?.url ?? "";
                    const isSaving = marketUrls.saving === cellKey;
                    return (
                      <div key={prod.value}>
                        {i > 0 && <RowDivider />}
                        <div className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-700">{prod.label}</span>
                            {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                            {!isSaving && existing?.url && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          <input
                            type="url"
                            value={value}
                            onChange={(e) => setMarketUrls(prev => ({ ...prev, drafts: { ...prev.drafts, [cellKey]: e.target.value } }))}
                            onBlur={() => {
                              if (draft !== undefined && draft !== (existing?.url ?? "")) {
                                handleMarketUrlSave(prod.value, country, draft);
                              }
                              setMarketUrls(prev => {
                                const nextDrafts = { ...prev.drafts };
                                delete nextDrafts[cellKey];
                                return { ...prev, drafts: nextDrafts };
                              });
                            }}
                            placeholder="https://..."
                            className="w-64 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 truncate"
                          />
                        </div>
                      </div>
                    );
                  })}
                </SettingsCard>

                {/* Facebook Page */}
                <SectionHeader>Facebook Page</SectionHeader>
                <SettingsCard>
                  {(() => {
                    const config = pageConfigs.configs.find((c) => c.country === country);
                    const isSaving = pageConfigs.saving === country;
                    return (
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-700">Page</span>
                          {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                          {!isSaving && config?.meta_page_id && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                        </div>
                        {metaPages.pages.length === 0 && !metaPages.loading ? (
                          <button
                            onClick={fetchMetaPages}
                            className="text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            Load pages
                          </button>
                        ) : metaPages.loading ? (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                        ) : (
                          <Dropdown
                            value={config?.meta_page_id ?? ""}
                            onChange={(v) => handlePageConfigChange(country, v)}
                            options={[
                              { value: "", label: "Not assigned" },
                              ...metaPages.pages.map((p) => ({
                                value: p.id,
                                label: p.name,
                              })),
                            ]}
                            placeholder="Not assigned"
                            className="w-52"
                          />
                        )}
                      </div>
                    );
                  })()}
                </SettingsCard>

                {/* Campaign Mappings */}
                <SectionHeader>Campaign Mappings</SectionHeader>
                {mappings.metaCampaigns.length === 0 ? (
                  <SettingsCard>
                    <div className="py-2 text-sm text-gray-400">
                      No active campaigns found in Meta.
                    </div>
                  </SettingsCard>
                ) : (
                  <SettingsCard>
                    {PRODUCTS.map((prod, i) => {
                      const mapping = mappings.campaignMappings.find(
                        (m) => m.product === prod.value && m.country === country
                      );
                      const cellKey = `${prod.value}-${country}`;
                      const isSaving = mappings.saving === cellKey;
                      const campaignAdSets = mapping?.meta_campaign_id
                        ? adSets.byCampaign[mapping.meta_campaign_id] ?? []
                        : [];
                      const isLoadingAdSets = adSets.loading === mapping?.meta_campaign_id;
                      return (
                        <div key={prod.value}>
                          {i > 0 && <RowDivider />}
                          <div className="py-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-700">{prod.label}</span>
                                {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                                {!isSaving && mapping?.template_adset_id && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                )}
                              </div>
                              <Dropdown
                                value={mapping?.meta_campaign_id ?? ""}
                                onChange={(v) => handleMappingChange(prod.value, country, v)}
                                options={[
                                  { value: "", label: "Not mapped" },
                                  ...mappings.metaCampaigns.map((c) => ({
                                    value: c.id,
                                    label: c.name,
                                  })),
                                ]}
                                placeholder="Not mapped"
                                className="w-52"
                              />
                            </div>
                            {mapping?.meta_campaign_id && (
                              <div className="mt-1.5 flex items-center justify-between">
                                <span className="text-xs text-gray-400 pl-4">Template ad set</span>
                                {campaignAdSets.length === 0 && !isLoadingAdSets ? (
                                  <button
                                    onClick={() => fetchAdSetsForCampaign(mapping.meta_campaign_id)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                  >
                                    Load ad sets
                                  </button>
                                ) : isLoadingAdSets ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                ) : (
                                  <Dropdown
                                    value={mapping?.template_adset_id ?? ""}
                                    onChange={(v) => handleTemplateAdSetChange(prod.value, country, v)}
                                    options={[
                                      { value: "", label: "No template" },
                                      ...campaignAdSets.map((a) => ({
                                        value: a.id,
                                        label: a.name,
                                      })),
                                    ]}
                                    placeholder="Select template"
                                    className="w-52"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </SettingsCard>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
