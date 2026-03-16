"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Copy,
  Check,
  Loader2,
  Mail,
  RotateCcw,
  AlertTriangle,
  Clock,
  Download,
  Upload,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  PauseCircle,
  HelpCircle,
  X,
  Send,
} from "lucide-react";
import type { InvoiceService, InvoiceSummaryRow, InvoiceStatus, InvoiceLog } from "@/types";
import StatusBadge from "./StatusBadge";
import ServiceModal from "./ServiceModal";
import BulkUploadModal from "./BulkUploadModal";

const JUNI_EMAIL = "q1k5n1k0@receipts.juni.co";
const JUNI_INVOICES_EMAIL = "q1k5n1k0@invoices.juni.co";

interface Insights {
  renewalAlerts: {
    service: InvoiceService;
    nextDueMonth: string;
    daysUntil: number;
    lastAmount: number | null;
    lastCurrency: string | null;
  }[];
  pauseCandidates: {
    service: InvoiceService;
    lastInvoiceDate: string | null;
    monthsSinceLastInvoice: number;
  }[];
  spendAnomalies: {
    service: InvoiceService;
    currentAmount: number;
    averageAmount: number;
    currency: string;
    percentChange: number;
  }[];
  monthlySpend: {
    period: string;
    total: number;
    currency: string;
    breakdown: { serviceName: string; amount: number }[];
  } | null;
}

function currentPeriod(): string {
  const now = new Date();
  // Default to previous month — invoices arrive after the billing period
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isMonthEndWarning(): boolean {
  return new Date().getDate() >= 20;
}

function fmtAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function InvoiceTrackerClient() {
  const [period, setPeriod] = useState(currentPeriod());
  const [summary, setSummary] = useState<InvoiceSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [modalService, setModalService] = useState<InvoiceService | null | "new">(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<"receipts" | "invoices" | null>(null);
  const [juniExpanded, setJuniExpanded] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ forwarded: number; errors: number; errorMessage?: string } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [unmatched, setUnmatched] = useState<InvoiceLog[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ serviceId: string; serviceName: string } | null>(null);
  const [lastUpload, setLastUpload] = useState<{ logId: string; serviceName: string; filename: string } | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [forwarding, setForwarding] = useState<string | null>(null); // log id being forwarded
  const [forwardingAll, setForwardingAll] = useState(false);
  const [forwardResult, setForwardResult] = useState<{ forwarded: number; errors: number } | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/summary?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/insights?period=${period}`);
      if (res.ok) setInsights(await res.json());
    } catch { /* ignore */ }
  }, [period]);

  const fetchUnmatched = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/unmatched?period=${period}`);
      if (res.ok) setUnmatched(await res.json());
    } catch { /* ignore */ }
  }, [period]);

  // Fetch last_run_at on mount
  useEffect(() => {
    fetch("/api/invoices/check")
      .then((r) => r.json())
      .then((d) => setLastRunAt(d.last_run_at || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchInsights();
    fetchUnmatched();
  }, [fetchSummary, fetchInsights, fetchUnmatched]);

  // Close action menu on click outside
  useEffect(() => {
    if (!actionMenu) return;
    function onClick() {
      setActionMenu(null);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [actionMenu]);

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/invoices/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCheckResult({ forwarded: 0, errors: 1, errorMessage: data.error || "Unknown error" });
      } else {
        setCheckResult({ forwarded: data.forwarded || 0, errors: data.errors || 0 });
        setLastRunAt(data.last_run_at || new Date().toISOString());
      }
      await fetchSummary();
      await fetchUnmatched();
      setTimeout(() => setCheckResult(null), 8000);
    } catch {
      setCheckResult({ forwarded: 0, errors: 1, errorMessage: "Request failed — check your connection" });
      setTimeout(() => setCheckResult(null), 8000);
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveService(data: Partial<InvoiceService>) {
    if (modalService === "new") {
      await fetch("/api/invoices/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else if (modalService) {
      await fetch(`/api/invoices/services/${modalService.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    await fetchSummary();
  }

  async function handleDeleteService(id: string) {
    await fetch(`/api/invoices/services/${id}`, { method: "DELETE" });
    await fetchSummary();
  }

  async function handleMarkManual(logId: string | undefined, serviceId: string) {
    if (logId) {
      await fetch(`/api/invoices/logs/${logId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "manual" }),
      });
    }
    setActionMenu(null);
    await fetchSummary();
  }

  async function handleRetry(logId: string) {
    setRetrying(logId);
    try {
      await fetch(`/api/invoices/logs/${logId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      await fetchSummary();
    } finally {
      setRetrying(null);
      setActionMenu(null);
    }
  }

  async function handleDismissUnmatched(logId: string) {
    await fetch(`/api/invoices/logs/${logId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setUnmatched((prev) => prev.filter((u) => u.id !== logId));
  }

  async function handleUploadPdf(serviceId: string, serviceName: string, file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("service_id", serviceId);
      formData.append("period", period);
      const res = await fetch("/api/invoices/upload", { method: "POST", body: formData });
      const data = await res.json();
      await fetchSummary();
      setUploadTarget(null);
      if (data.logId) {
        setLastUpload({ logId: data.logId, serviceName, filename: file.name });
        setTimeout(() => setLastUpload(null), 15000);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteLog(logId: string) {
    await fetch(`/api/invoices/logs/${logId}`, { method: "DELETE" });
    setLastUpload(null);
    await fetchSummary();
  }

  async function handleForwardLog(logId: string) {
    setForwarding(logId);
    try {
      const res = await fetch(`/api/invoices/logs/${logId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forward" }),
      });
      await res.json();
      await fetchSummary();
    } finally {
      setForwarding(null);
    }
  }

  async function handleForwardAll() {
    setForwardingAll(true);
    setForwardResult(null);
    try {
      const res = await fetch("/api/invoices/forward-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      setForwardResult({ forwarded: data.forwarded || 0, errors: data.errors || 0 });
      await fetchSummary();
      setTimeout(() => setForwardResult(null), 8000);
    } catch {
      setForwardResult({ forwarded: 0, errors: 1 });
      setTimeout(() => setForwardResult(null), 8000);
    } finally {
      setForwardingAll(false);
    }
  }

  function copyToClipboard(email: string, type: "receipts" | "invoices") {
    navigator.clipboard.writeText(email);
    setCopiedEmail(type);
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  // Summary counts
  const done = summary.filter((r) => r.status === "forwarded" || r.status === "manual").length;
  const needsAction = summary.length - summary.filter((r) => r.status === "not_due").length;
  const pct = needsAction > 0 ? Math.round((done / needsAction) * 100) : 100;

  // Count individual ready logs across all services (not summary rows, since
  // a service might show "forwarded" if some logs are forwarded and others ready)
  const readyCount = summary.reduce(
    (sum, r) => sum + r.logs.filter((l) => l.status === "ready").length,
    0
  );

  const counts = {
    total: summary.length,
    forwarded: summary.filter((r) => r.status === "forwarded").length,
    ready: readyCount,
    waiting: summary.filter((r) => r.status === "waiting").length,
    error: summary.filter((r) => r.status === "error").length,
    manual: summary.filter((r) => r.status === "manual").length,
    not_due: summary.filter((r) => r.status === "not_due").length,
    received_no_pdf: summary.filter((r) => r.status === "received_no_pdf").length,
  };

  // Usage-based services with no invoices yet show as not_due, not waiting
  const showMonthEndWarning = isMonthEndWarning() && period === currentPeriod() && counts.waiting > 0;
  const hasInsights = insights && (
    insights.renewalAlerts.length > 0 ||
    insights.pauseCandidates.length > 0 ||
    insights.spendAnomalies.length > 0
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-forward invoice PDFs to Juni for accounting
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Month navigation */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button
              onClick={() => setPeriod(shiftPeriod(period, -1))}
              className="p-1 text-gray-500 hover:text-gray-700 rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 px-2 min-w-[130px] text-center">
              {formatPeriod(period)}
            </span>
            <button
              onClick={() => setPeriod(shiftPeriod(period, 1))}
              className="p-1 text-gray-500 hover:text-gray-700 rounded"
              disabled={period >= currentPeriod()}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Bulk Upload */}
          <button
            onClick={() => setBulkUploadOpen(true)}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Bulk Upload"
          >
            <Upload className="w-4 h-4" />
          </button>

          {/* Export CSV */}
          <a
            href={`/api/invoices/export?period=${period}`}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Export CSV"
            download
          >
            <Download className="w-4 h-4" />
          </a>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Check Now"
            >
              {checking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
            {lastRunAt && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(lastRunAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Checking in progress banner */}
      {checking && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>Scanning inbox for new invoices... this can take up to 30 seconds</span>
        </div>
      )}

      {/* Check result toast */}
      {checkResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
          checkResult.errors > 0
            ? "bg-red-50 border border-red-200 text-red-700"
            : checkResult.forwarded > 0
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-gray-50 border border-gray-200 text-gray-600"
        }`}>
          {checkResult.errors > 0 ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Check className="w-4 h-4 flex-shrink-0" />
          )}
          {checkResult.forwarded > 0 && (
            <span>{checkResult.forwarded} new invoice{checkResult.forwarded > 1 ? "s" : ""} found</span>
          )}
          {checkResult.errors > 0 && (
            <span>{checkResult.errorMessage || `${checkResult.errors} error${checkResult.errors > 1 ? "s" : ""}`}</span>
          )}
          {checkResult.forwarded === 0 && checkResult.errors === 0 && (
            <span>No new invoices found</span>
          )}
        </div>
      )}

      {/* Forward result toast */}
      {forwardResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
          forwardResult.errors > 0
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-emerald-50 border border-emerald-200 text-emerald-700"
        }`}>
          {forwardResult.errors > 0 ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Check className="w-4 h-4 flex-shrink-0" />
          )}
          <span>
            {forwardResult.forwarded > 0 && `${forwardResult.forwarded} invoice${forwardResult.forwarded > 1 ? "s" : ""} sent to Juni`}
            {forwardResult.forwarded > 0 && forwardResult.errors > 0 && ", "}
            {forwardResult.errors > 0 && `${forwardResult.errors} error${forwardResult.errors > 1 ? "s" : ""}`}
          </span>
        </div>
      )}

      {/* Send All to Juni banner */}
      {readyCount > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg flex items-center justify-between bg-indigo-50 border border-indigo-200">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span className="text-sm text-indigo-700">
              <span className="font-semibold">{readyCount}</span> invoice{readyCount > 1 ? "s" : ""} ready to send to Juni
            </span>
          </div>
          <button
            onClick={handleForwardAll}
            disabled={forwardingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {forwardingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send All to Juni
          </button>
        </div>
      )}

      {/* Upload success toast with undo */}
      {lastUpload && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-700">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>
              <span className="font-medium">{lastUpload.filename}</span> uploaded for {lastUpload.serviceName} ({formatPeriod(period)})
            </span>
          </div>
          <button
            onClick={() => handleDeleteLog(lastUpload.logId)}
            className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded transition-colors ml-3 flex-shrink-0"
          >
            Undo
          </button>
        </div>
      )}

      {/* Insights alerts */}
      {hasInsights && (
        <div className="space-y-2 mb-4">
          {/* Renewal alerts */}
          {insights.renewalAlerts.map((a) => (
            <div key={a.service.id} className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700">
              <CalendarClock className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-medium">{a.service.name}</span> renewal coming up in {a.daysUntil} days
                {a.lastAmount && ` (~${fmtAmount(a.lastAmount, a.lastCurrency || "SEK")})`}
              </span>
            </div>
          ))}

          {/* Spend anomalies */}
          {insights.spendAnomalies.map((a) => (
            <div key={a.service.id} className={`px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
              a.percentChange > 0
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-emerald-50 border border-emerald-200 text-emerald-700"
            }`}>
              {a.percentChange > 0 ? (
                <TrendingUp className="w-4 h-4 flex-shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 flex-shrink-0" />
              )}
              <span>
                <span className="font-medium">{a.service.name}</span>: {fmtAmount(a.currentAmount, a.currency)} this month
                ({a.percentChange > 0 ? "+" : ""}{a.percentChange}% vs. avg {fmtAmount(a.averageAmount, a.currency)})
              </span>
            </div>
          ))}

          {/* Pause candidates */}
          {insights.pauseCandidates.map((p) => (
            <div key={p.service.id} className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-600">
              <PauseCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-medium">{p.service.name}</span> — no invoice in {p.monthsSinceLastInvoice} months. Still using it?
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Month-end warning */}
      {showMonthEndWarning && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-medium">{counts.waiting} service{counts.waiting > 1 ? "s" : ""}</span> still waiting for invoices this month.
            Month ends soon — check if any need manual handling.
          </span>
        </div>
      )}

      {/* Unmatched emails */}
      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl mb-4 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-amber-200">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              {unmatched.length} unmatched email{unmatched.length > 1 ? "s" : ""} — not linked to any service
            </span>
          </div>
          {unmatched.map((u) => (
            <div key={u.id} className="px-4 py-2.5 flex items-center justify-between border-b border-amber-100 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700 truncate">{u.email_subject}</p>
                <p className="text-xs text-gray-400">{u.email_from} &middot; {u.email_date ? new Date(u.email_date).toLocaleDateString() : ""}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                <button
                  onClick={() => {
                    // Pre-fill new service with this sender
                    setModalService("new");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded hover:bg-indigo-50"
                >
                  Add as service
                </button>
                <button
                  onClick={() => handleDismissUnmatched(u.id)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Juni Email Info — collapsible */}
      <div className="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => setJuniExpanded(!juniExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Juni Forwarding Addresses</span>
          </div>
          {juniExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {juniExpanded && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Paid Invoices & Receipts</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-gray-800 font-mono">{JUNI_EMAIL}</code>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(JUNI_EMAIL, "receipts"); }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Copy"
                  >
                    {copiedEmail === "receipts" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Unpaid Invoices</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-gray-800 font-mono">{JUNI_INVOICES_EMAIL}</code>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(JUNI_INVOICES_EMAIL, "invoices"); }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Copy"
                  >
                    {copiedEmail === "invoices" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar + Spend */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">
              <span className="font-semibold text-gray-800">{done}</span> of{" "}
              <span className="font-semibold text-gray-800">{needsAction}</span> handled
            </span>
            {counts.not_due > 0 && (
              <span className="text-gray-400 text-xs">
                ({counts.not_due} not due)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {insights?.monthlySpend && (
              <span className="text-gray-700 font-medium">
                Total: {fmtAmount(insights.monthlySpend.total, insights.monthlySpend.currency)}
              </span>
            )}
            {counts.forwarded > 0 && (
              <span className="text-emerald-600">
                <span className="font-semibold">{counts.forwarded}</span> forwarded
              </span>
            )}
            {counts.ready > 0 && (
              <span className="text-indigo-600">
                <span className="font-semibold">{counts.ready}</span> ready
              </span>
            )}
            {counts.manual > 0 && (
              <span className="text-gray-500">
                <span className="font-semibold">{counts.manual}</span> manual
              </span>
            )}
            {counts.waiting > 0 && (
              <span className="text-amber-600">
                <span className="font-semibold">{counts.waiting}</span> waiting
              </span>
            )}
            {counts.error > 0 && (
              <span className="text-red-600">
                <span className="font-semibold">{counts.error}</span> error
              </span>
            )}
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              pct === 100
                ? "bg-emerald-500"
                : pct >= 75
                ? "bg-emerald-400"
                : pct >= 50
                ? "bg-amber-400"
                : "bg-amber-300"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{pct}%</p>
      </div>

      {/* Service List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_80px_160px_44px] gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <span>Service</span>
          <span>Cycle</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : summary.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No services added yet.</p>
            <button
              onClick={() => setModalService("new")}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              Add your first service
            </button>
          </div>
        ) : (
          summary.map((row) => {
            const isOverdue = showMonthEndWarning && row.status === "waiting";
            return (
              <div key={row.service.id}>
                <div
                  className={`grid grid-cols-[1fr_80px_160px_44px] gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 items-center cursor-pointer ${
                    isOverdue ? "bg-amber-50/30" : ""
                  }`}
                  onClick={() => setExpandedRow(expandedRow === row.service.id ? null : row.service.id)}
                >
                  {/* Service name */}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{row.service.name}</p>
                      {row.service.is_manual_upload && (
                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          Manual
                        </span>
                      )}
                      {row.service.forward_to === "invoices" && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Unpaid
                        </span>
                      )}
                      {isOverdue && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                          Overdue
                        </span>
                      )}
                    </div>
                    {row.service.sender_patterns.length > 0 && (
                      <p className="text-xs text-gray-400 truncate">
                        {row.service.sender_patterns.join(", ")}
                      </p>
                    )}
                    {row.service.billing_url && (
                      <a
                        href={row.service.billing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline truncate block"
                      >
                        Billing page &rarr;
                      </a>
                    )}
                  </div>

                  {/* Cycle */}
                  <span className="text-xs text-gray-500 capitalize">
                    {row.service.billing_cycle === "usage_based" ? "Usage" : row.service.billing_cycle}
                  </span>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {row.service.is_manual_upload ? (
                      <>
                        {row.status === "forwarded" || row.status === "manual" ? (
                          <StatusBadge status={row.status} />
                        ) : null}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadTarget({ serviceId: row.service.id, serviceName: row.service.name });
                          }}
                          className="p-1 rounded border bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          title="Upload PDF"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <StatusBadge status={row.status} />
                        {row.invoiceCount > 1 && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                            {row.invoiceCount}x
                          </span>
                        )}
                        {row.status === "ready" && row.logs.some((l) => l.status === "ready") && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const readyLogs = row.logs.filter((l) => l.status === "ready");
                              setForwarding(row.service.id);
                              for (const l of readyLogs) {
                                await handleForwardLog(l.id);
                              }
                              setForwarding(null);
                            }}
                            disabled={forwarding === row.service.id}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            title="Send to Juni"
                          >
                            {forwarding === row.service.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Send
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenu(actionMenu === row.service.id ? null : row.service.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {actionMenu === row.service.id && (
                      <div
                        className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setActionMenu(null);
                            setModalService(row.service);
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Edit service
                        </button>
                        <button
                          onClick={() => {
                            setActionMenu(null);
                            setUploadTarget({ serviceId: row.service.id, serviceName: row.service.name });
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Upload PDF manually
                        </button>
                        {row.status === "ready" && row.log?.id && (
                          <button
                            onClick={() => {
                              setActionMenu(null);
                              handleForwardLog(row.log!.id);
                            }}
                            disabled={forwarding === row.log.id}
                            className="w-full text-left px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"
                          >
                            {forwarding === row.log.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Send to Juni
                          </button>
                        )}
                        {(row.status === "error" || row.status === "received_no_pdf") && row.log?.id && (
                          <button
                            onClick={() => handleRetry(row.log!.id)}
                            disabled={retrying === row.log.id}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            {retrying === row.log.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Retry forward
                          </button>
                        )}
                        {row.status !== "forwarded" && row.status !== "not_due" && (
                          <button
                            onClick={() => handleMarkManual(row.log?.id, row.service.id)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Mark as handled
                          </button>
                        )}
                        {row.log?.id && (
                          <button
                            onClick={async () => {
                              setActionMenu(null);
                              await handleDeleteLog(row.log!.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete log entry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded log details */}
                {expandedRow === row.service.id && row.logs.length > 0 && (
                  <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 text-xs text-gray-500 space-y-3">
                    {row.logs.length > 1 && (
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 mb-1">
                        <span className="font-medium text-gray-600">
                          {row.logs.length} invoices this period
                        </span>
                        {row.totalAmount != null && (
                          <span className="text-gray-600 font-mono">
                            — Total: {fmtAmount(row.totalAmount, row.totalCurrency || "SEK")}
                          </span>
                        )}
                      </div>
                    )}
                    {row.logs.map((log, logIdx) => (
                      <div key={log.id} className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-w-lg">
                        {row.logs.length > 1 && (
                          <>
                            <span className="text-gray-400 font-medium col-span-2">
                              Invoice #{logIdx + 1}
                            </span>
                          </>
                        )}
                        {log.email_from && (
                          <>
                            <span className="text-gray-400">From</span>
                            <span className="text-gray-600 truncate">{log.email_from}</span>
                          </>
                        )}
                        {log.email_subject && (
                          <>
                            <span className="text-gray-400">Subject</span>
                            <span className="text-gray-600 truncate">{log.email_subject}</span>
                          </>
                        )}
                        {log.email_date && (
                          <>
                            <span className="text-gray-400">Email date</span>
                            <span className="text-gray-600">{new Date(log.email_date).toLocaleString()}</span>
                          </>
                        )}
                        {log.amount != null && (
                          <>
                            <span className="text-gray-400">Amount</span>
                            <span className="text-gray-600 font-mono">{fmtAmount(log.amount, log.currency || "SEK")}</span>
                          </>
                        )}
                        {log.pdf_filename && (
                          <>
                            <span className="text-gray-400">PDF</span>
                            <span className="text-gray-600">{log.pdf_filename}</span>
                          </>
                        )}
                        {log.forwarded_at && (
                          <>
                            <span className="text-gray-400">Forwarded</span>
                            <span className="text-gray-600">{new Date(log.forwarded_at).toLocaleString()}</span>
                          </>
                        )}
                        {log.error_message && (
                          <>
                            <span className="text-gray-400">Error</span>
                            <span className="text-red-500">{log.error_message}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded: no log yet */}
                {expandedRow === row.service.id && row.logs.length === 0 && (
                  <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 text-xs text-gray-400 italic">
                    No email received yet for this period.
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Add Service button */}
        <div className="px-4 py-3">
          <button
            onClick={() => setModalService("new")}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        </div>
      </div>

      {/* Juni matching reminder — show when month is fully handled */}
      {pct === 100 && done > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Remember to match these transactions in Juni
          </p>
          <div className="space-y-1">
            {summary
              .filter((r) => r.status === "forwarded" || r.status === "manual")
              .map((r) => (
                <div key={r.service.id} className="flex items-center gap-2 text-sm text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span>{r.service.name}</span>
                  {r.totalAmount != null && (
                    <span className="text-amber-500 font-mono text-xs">
                      {fmtAmount(r.totalAmount, r.totalCurrency || "SEK")}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setUploadTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Invoice PDF</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a PDF for <span className="font-medium">{uploadTarget.serviceName}</span> — {formatPeriod(period)}.
              It will be forwarded to Juni and marked as handled.
            </p>
            <label className="block">
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Uploading and forwarding...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to select a PDF file</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadPdf(uploadTarget.serviceId, uploadTarget.serviceName, file);
                }}
              />
            </label>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setUploadTarget(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Modal */}
      {modalService !== null && (
        <ServiceModal
          service={modalService === "new" ? null : modalService}
          onClose={() => setModalService(null)}
          onSave={handleSaveService}
          onDelete={
            modalService !== "new" && modalService
              ? () => handleDeleteService(modalService.id)
              : undefined
          }
        />
      )}

      {/* Bulk Upload Modal */}
      {bulkUploadOpen && (
        <BulkUploadModal
          onClose={() => setBulkUploadOpen(false)}
          onComplete={() => fetchSummary()}
        />
      )}
    </div>
  );
}
