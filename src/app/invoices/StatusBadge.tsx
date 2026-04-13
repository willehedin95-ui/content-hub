"use client";

import type { InvoiceStatus } from "@/types";
import { Check, CheckCheck, Clock, AlertCircle, Minus, HelpCircle, Send, XCircle } from "lucide-react";

const config: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  waiting: { label: "Waiting", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  pending: { label: "Pending", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: Send },
  sent: { label: "Sent", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Check },
  done: { label: "Done", color: "text-emerald-800", bg: "bg-emerald-100 border-emerald-300", icon: CheckCheck },
  error: { label: "Error", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: AlertCircle },
  unmatched: { label: "Unmatched", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: HelpCircle },
  not_due: { label: "Not due", color: "text-gray-400", bg: "bg-gray-50 border-gray-100", icon: Minus },
  dismissed: { label: "Dismissed", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: XCircle },
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
