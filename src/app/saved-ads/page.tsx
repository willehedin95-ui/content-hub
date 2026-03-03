import { redirect } from "next/navigation";

export default async function SavedAdsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  redirect(
    params.id
      ? `/ad-library?tab=saved&id=${params.id}`
      : "/ad-library?tab=saved"
  );
}
