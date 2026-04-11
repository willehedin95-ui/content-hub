"use client";

import Link from "next/link";

type TabValue = "invoices" | "expenses";

const TABS: { value: TabValue; label: string; href: string }[] = [
  { value: "invoices", label: "Invoices", href: "/invoices" },
  { value: "expenses", label: "Expenses", href: "/invoices?tab=expenses" },
];

export default function InvoicePageTabs({ activeTab }: { activeTab: TabValue }) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === tab.value
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
