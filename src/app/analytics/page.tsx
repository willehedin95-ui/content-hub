import PageAnalyticsClient from "./PageAnalyticsClient";
import { createServerSupabase } from "@/lib/supabase";
import { isShopifyConfigured } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const db = createServerSupabase();
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;

  const ga4PropertyIds = (settings.ga4_property_ids ?? {}) as Record<string, string>;
  const ga4Configured = Object.values(ga4PropertyIds).some((v) => !!v);
  const clarityConfigured = !!(settings.clarity_api_token as string);
  const shopifyConfigured = isShopifyConfigured();

  return (
    <div className="p-8">
      <PageAnalyticsClient
        ga4Configured={ga4Configured}
        clarityConfigured={clarityConfigured}
        shopifyConfigured={shopifyConfigured}
      />
    </div>
  );
}
