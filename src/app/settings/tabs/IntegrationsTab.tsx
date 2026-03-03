"use client";

import {
  RefreshCw,
  Loader2,
} from "lucide-react";
import { LANGUAGES } from "@/types";
import {
  SettingsCard,
  SectionHeader,
  Row,
  RowDivider,
  ActionButton,
  SaveButton,
  GA4TestButton,
  ClarityTokenRow,
  ExcludeIPRow,
} from "../components";
import type { SettingsProps } from "../components";

interface IntegrationsTabProps extends SettingsProps {
  kie: {
    balance: number | null;
    loading: boolean;
    error: string | null;
  };
  shopify: {
    status: { shop: string } | null;
    loading: boolean;
    error: string | null;
  };
  googleAds: {
    status: { customerId: string; descriptiveName: string } | null;
    loading: boolean;
    error: string | null;
  };
  capi: {
    stats: { total: number; sent: number; failed: number; pending: number } | null;
    syncing: boolean;
    syncResult: { sent: number; skipped: number; errors: number } | null;
    error: string | null;
  };
  fetchKieCredits: () => void;
  testShopifyConnection: () => void;
  testGoogleAdsConnection: () => void;
  syncCapi: () => void;
  fetchCapiStats: () => void;
}

export default function IntegrationsTab({
  settings,
  setSettings,
  saved,
  handleSave,
  kie,
  shopify,
  googleAds,
  capi,
  fetchKieCredits,
  testShopifyConnection,
  testGoogleAdsConnection,
  syncCapi,
  fetchCapiStats,
}: IntegrationsTabProps) {
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Integrations</h2>
      <SettingsCard>
        <Row
          label="Kie AI Credits"
          description="Image generation (nano-banana-2)"
          action={
            <div className="flex items-center gap-2.5">
              {kie.balance !== null && (
                <span className="text-base font-semibold text-gray-800 tabular-nums">
                  {kie.balance.toLocaleString()}
                </span>
              )}
              {kie.error && <span className="text-xs text-red-500">{kie.error}</span>}
              <ActionButton onClick={fetchKieCredits} disabled={kie.loading}>
                {kie.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : kie.balance === null ? (
                  "Check"
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </ActionButton>
            </div>
          }
        />
      </SettingsCard>

      <SectionHeader>Page Analytics</SectionHeader>
      <SettingsCard>
        <Row
          label="Shopify"
          description={
            shopify.status
              ? shopify.status.shop
              : shopify.error
              ? shopify.error
              : "Configured via environment variables"
          }
          descriptionColor={shopify.status ? "text-emerald-600" : shopify.error ? "text-red-500" : undefined}
          action={
            <ActionButton onClick={testShopifyConnection} disabled={shopify.loading}>
              {shopify.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : shopify.status ? (
                "Connected"
              ) : (
                "Test"
              )}
            </ActionButton>
          }
        />
        <RowDivider />
        <Row
          label="Google Ads"
          description={
            googleAds.status
              ? `${googleAds.status.descriptiveName} (${googleAds.status.customerId})`
              : googleAds.error
              ? googleAds.error
              : "Configured via environment variables"
          }
          descriptionColor={googleAds.status ? "text-emerald-600" : googleAds.error ? "text-red-500" : undefined}
          action={
            <ActionButton onClick={testGoogleAdsConnection} disabled={googleAds.loading}>
              {googleAds.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : googleAds.status ? (
                "Connected"
              ) : (
                "Test"
              )}
            </ActionButton>
          }
        />
        <RowDivider />
        {LANGUAGES.filter((l) => l.domain).map((lang, i) => {
          const mid = settings.ga4_measurement_ids[lang.value] || "";
          const pid = (settings.ga4_property_ids ?? {})[lang.value] || "";
          return (
            <div key={lang.value}>
              {i > 0 && <RowDivider />}
              <Row
                label={`GA4 Measurement — ${lang.label}`}
                description={mid || "Not configured"}
                descriptionColor={mid ? "text-emerald-600" : undefined}
                action={
                  <input
                    type="text"
                    value={mid}
                    onChange={(e) => setSettings((s) => ({
                      ...s,
                      ga4_measurement_ids: { ...s.ga4_measurement_ids, [lang.value]: e.target.value },
                    }))}
                    placeholder="G-XXXXXXXXXX"
                    className="w-36 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                }
              />
              <Row
                label={`GA4 Property — ${lang.label}`}
                description={pid ? `Property ${pid}` : "GA4 Admin → Property Details"}
                descriptionColor={pid ? "text-emerald-600" : undefined}
                action={
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={pid}
                      onChange={(e) => setSettings((s) => ({
                        ...s,
                        ga4_property_ids: { ...(s.ga4_property_ids ?? {}), [lang.value]: e.target.value },
                      }))}
                      placeholder="123456789"
                      className="w-28 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    {pid && (
                      <GA4TestButton propertyId={pid} />
                    )}
                  </div>
                }
              />
            </div>
          );
        })}
        <RowDivider />
        {LANGUAGES.filter((l) => l.domain).map((lang, i) => {
          const cid = settings.clarity_project_ids?.[lang.value] || "";
          return (
            <div key={`clarity-${lang.value}`}>
              {i > 0 && <RowDivider />}
              <Row
                label={`Clarity Project — ${lang.label}`}
                description={cid || "Not configured"}
                descriptionColor={cid ? "text-emerald-600" : undefined}
                action={
                  <input
                    type="text"
                    value={cid}
                    onChange={(e) => setSettings((s) => ({
                      ...s,
                      clarity_project_ids: { ...(s.clarity_project_ids ?? {}), [lang.value]: e.target.value },
                    }))}
                    placeholder="Project ID"
                    className="w-36 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                }
              />
            </div>
          );
        })}
        <RowDivider />
        <ClarityTokenRow
          token={settings.clarity_api_token ?? ""}
          onChange={(v) => setSettings((s) => ({ ...s, clarity_api_token: v }))}
        />
        <RowDivider />
        <Row
          label="Shopify store domains"
          description="Outbound links to these domains get UTM tags"
          action={
            <input
              type="text"
              value={settings.shopify_domains}
              onChange={(e) => setSettings((s) => ({ ...s, shopify_domains: e.target.value }))}
              placeholder="store.myshopify.com"
              className="w-44 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          }
        />
        <RowDivider />
        <Row
          label="Meta Pixel ID"
          description="Tracks page views & clicks for Meta ad optimization"
          action={
            <input
              type="text"
              value={settings.meta_pixel_id}
              onChange={(e) => setSettings((s) => ({ ...s, meta_pixel_id: e.target.value }))}
              placeholder="123456789012345"
              className="w-44 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          }
        />
        <RowDivider />
        <Row
          label="Meta Conversions API"
          description={
            capi.error
              ? capi.error
              : capi.syncResult
              ? `Last sync: ${capi.syncResult.sent} sent, ${capi.syncResult.skipped} skipped${capi.syncResult.errors ? `, ${capi.syncResult.errors} errors` : ""}`
              : capi.stats
              ? `${capi.stats.sent} events sent, ${capi.stats.pending} pending`
              : "Send purchase events from Shopify to Meta"
          }
          descriptionColor={capi.error ? "text-red-500" : capi.stats?.sent ? "text-emerald-600" : undefined}
          action={
            <div className="flex items-center gap-2">
              {capi.stats && (
                <span className="text-xs text-gray-400 tabular-nums">{capi.stats.total} total</span>
              )}
              <ActionButton onClick={() => { syncCapi(); if (!capi.stats) fetchCapiStats(); }} disabled={capi.syncing}>
                {capi.syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Sync"
                )}
              </ActionButton>
            </div>
          }
        />
        <RowDivider />
        <ExcludeIPRow
          excludedIps={settings.excluded_ips ?? []}
          onChange={(ips) => setSettings((s) => ({ ...s, excluded_ips: ips }))}
        />
      </SettingsCard>
      <SaveButton saved={saved} onSave={handleSave} />

      <SectionHeader>Services</SectionHeader>
      <p className="text-xs text-gray-400 mb-2.5">
        All API keys configured via environment variables in Vercel.
      </p>
      <SettingsCard>
        {[
          { name: "OpenAI", env: "OPENAI_API_KEY", desc: "GPT-4o text translation & quality analysis" },
          { name: "Cloudflare Pages", env: "CF_PAGES_*", desc: "Landing page hosting" },
          { name: "Meta Marketing", env: "META_*", desc: "Ad campaign management" },
          { name: "Google Ads", env: "GOOGLE_ADS_*", desc: "Google Ads campaign data" },
          { name: "Shopify", env: "SHOPIFY_*", desc: "Order data for A/B test conversions" },
          { name: "Kie AI", env: "KIE_AI_API_KEY", desc: "Image generation & translation" },
          { name: "Resend", env: "RESEND_API_KEY", desc: "Email notifications" },
          { name: "Google Drive", env: "GDRIVE_*", desc: "Image import & export" },
        ].map((svc, i) => (
          <div key={svc.name}>
            {i > 0 && <RowDivider />}
            <Row
              label={svc.name}
              description={svc.desc}
              action={
                <code className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                  {svc.env}
                </code>
              }
            />
          </div>
        ))}
      </SettingsCard>
    </>
  );
}
