import BrandCheckClient from "../brand-check/BrandCheckClient";

export const metadata = { title: "Brand Check" };

// Publik, gömd mobilsida. Skyddad av hemlig token i URL: /bcheck?token=...
// (token jämförs mot env BRAND_CHECK_TOKEN). Vitlistad i middleware.
export default async function PublicBrandCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const secret = process.env.BRAND_CHECK_TOKEN;
  const ok = typeof secret === "string" && secret.length > 0 && token === secret;

  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Ej behörig.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandCheckClient endpoint="/api/bcheck" token={token} />
    </div>
  );
}
