"use client";

import { CheckCircle2 } from "lucide-react";

export default function ReviewEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="bg-green-100 rounded-full p-4 mb-4">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h2>
      <p className="text-sm text-gray-500">No items need your attention right now.</p>
    </div>
  );
}
