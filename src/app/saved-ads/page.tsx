import { Suspense } from "react";
import SavedAdsDashboard from "@/components/saved-ads/SavedAdsDashboard";

export default function SavedAdsPage() {
  return (
    <Suspense>
      <SavedAdsDashboard />
    </Suspense>
  );
}
