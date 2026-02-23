import AnalyticsClient from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const metaConfigured = !!(process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID);
  const shopifyConfigured = !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_CLIENT_ID);

  return (
    <div className="p-8">
      <AnalyticsClient
        metaConfigured={metaConfigured}
        shopifyConfigured={shopifyConfigured}
      />
    </div>
  );
}
