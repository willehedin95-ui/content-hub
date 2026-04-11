export const dynamic = "force-dynamic";

import InvoiceTrackerClient from "./InvoiceTrackerClient";
import ExpensesTab from "./ExpensesTab";
import InvoicePageTabs from "./InvoicePageTabs";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "expenses" ? "expenses" : "invoices";

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <InvoicePageTabs activeTab={activeTab} />
      </div>
      {activeTab === "invoices" && <InvoiceTrackerClient />}
      {activeTab === "expenses" && <ExpensesTab />}
    </div>
  );
}
