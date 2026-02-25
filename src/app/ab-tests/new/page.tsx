import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import NewABTestClient from "./NewABTestClient";

export default function NewABTestPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      }
    >
      <NewABTestClient />
    </Suspense>
  );
}
