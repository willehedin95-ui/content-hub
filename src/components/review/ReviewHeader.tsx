"use client";

import Link from "next/link";
import { X } from "lucide-react";

interface Props {
  total: number;
}

export default function ReviewHeader({ total }: Props) {
  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between h-[56px]">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">Review</h1>
        {total > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {total}
          </span>
        )}
      </div>
      <Link
        href="/"
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </Link>
    </div>
  );
}
