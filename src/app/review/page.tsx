import { Suspense } from "react";
import ReviewClient from "@/components/review/ReviewClient";

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewClient />
    </Suspense>
  );
}
