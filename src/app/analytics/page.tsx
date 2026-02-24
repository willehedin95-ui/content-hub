import AnalyticsClient from "./AnalyticsClient";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const metaConfigured = !!(process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID);
  const shopifyConfigured = !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID);

  const db = createServerSupabase();
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const ga4Ids = (settings.ga4_measurement_ids ?? {}) as Record<string, string>;
  const ga4Configured = Object.values(ga4Ids).some((v) => !!v);
  const clarityConfigured = !!(settings.clarity_project_id as string);

  return (
    <div className="p-8">
      <AnalyticsClient
        metaConfigured={metaConfigured}
        shopifyConfigured={shopifyConfigured}
        ga4Configured={ga4Configured}
        clarityConfigured={clarityConfigured}
      />
    </div>
  );
}
