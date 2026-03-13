"use client";

import type { InvoiceStatus } from "@/types";
import { Check, Clock, AlertCircle, Minus, FileText, Hand } from "lucide-react";

const config: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  forwarded: { label: "Forwarded", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Check },
  waiting: { label: "Waiting", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  received_no_pdf: { label: "No PDF", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: FileText },
  error: { label: "Error", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: AlertCircle },
  manual: { label: "Manual", color: "text-gray-600", bg: "bg-gray-50 border-gray-200", icon: Hand },
  not_due: { label: "Not due", color: "text-gray-400", bg: "bg-gray-50 border-gray-100", icon: Minus },
};

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  const c = config[status] || config.waiting;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </span>
  );
}
