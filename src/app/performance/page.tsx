import PerformanceClient from "./PerformanceClient";
import { createServerSupabase } from "@/lib/supabase";
import { isShopifyConfigured } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const metaConfigured = !!(
    process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID
  );
  const shopifyConfiguredEnv = !!(
    process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID
  );

  const db = createServerSupabase();
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;

  const ga4PropertyIds = (settings.ga4_property_ids ?? {}) as Record<
    string,
    string
  >;
  const ga4Configured = Object.values(ga4PropertyIds).some((v) => !!v);

  const ga4MeasurementIds = (settings.ga4_measurement_ids ?? {}) as Record<
    string,
    string
  >;
  const ga4TrackingConfigured = Object.values(ga4MeasurementIds).some(
    (v) => !!v
  );

  const clarityConfigured = !!(settings.clarity_api_token as string);
  const clarityTrackingConfigured = !!(settings.clarity_project_id as string);
  const shopifyConfigured = isShopifyConfigured();

  return (
    <div className="p-8">
      <PerformanceClient
        pageAnalyticsConfig={{
          ga4Configured,
          clarityConfigured,
          shopifyConfigured,
        }}
        campaignTrackingConfig={{
          metaConfigured,
          shopifyConfigured: shopifyConfiguredEnv,
          ga4Configured: ga4TrackingConfigured,
          clarityConfigured: clarityTrackingConfigured,
        }}
      />
    </div>
  );
}
