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
import type { InvoiceService, InvoiceSummaryRow, InvoiceLog } from "@/types";

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

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  action?: { label: string; onClick: () => void };
}

function currentPeriod(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function actualCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function extractServiceNameFromEmail(email: string): string {
  const domain = (email.split("@")[1] || "").toLowerCase();
  const parts = domain.split(".");
  // Use second-to-last part for subdomains: "business-updates.facebook.com" -> "facebook"
  const name = parts.length >= 3 ? parts[parts.length - 2] : parts[0] || "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function extractDomainPattern(email: string): string {
  const domain = email.split("@")[1] || "";
  return `@${domain}`;
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
  const [retrying, setRetrying] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const [unmatched, setUnmatched] = useState<InvoiceLog[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ serviceId: string; serviceName: string } | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [forwardingAll, setForwardingAll] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bulkDoneLoading, setBulkDoneLoading] = useState(false);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [unmatchedForService, setUnmatchedForService] = useState<InvoiceLog | null>(null);

  // --- Toast helpers ---

  function addToast(type: Toast["type"], message: string, action?: Toast["action"]) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message, action }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // --- Data fetching ---

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

  const fetchTotalPending = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices/bulk-done");
      if (res.ok) {
        const data = await res.json();
        setTotalPendingCount(data.count || 0);
      }
    } catch { /* ignore */ }
  }, []);

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
    fetchTotalPending();
  }, [fetchSummary, fetchInsights, fetchUnmatched, fetchTotalPending]);

  // Close action menu on click outside
  useEffect(() => {
    if (!actionMenu) return;
    function onClick() {
      setActionMenu(null);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [actionMenu]);

  // --- Handlers ---

  async function handleCheck() {
    setChecking(true);
    const scanToastId = crypto.randomUUID();
    setToasts((prev) => [...prev, { id: scanToastId, type: "info", message: "Scanning inbox for new invoices..." }]);
    try {
      const res = await fetch("/api/invoices/check", { method: "POST" });
      const data = await res.json();
      // Remove scanning toast
      setToasts((prev) => prev.filter((t) => t.id !== scanToastId));
      if (!res.ok || data.error) {
        addToast("error", data.error || "Unknown error checking inbox");
      } else {
        const errors = data.errors || 0;
        const forwarded = data.forwarded || 0;
        if (errors > 0) {
          const errMsg = data.errorDetails?.length ? data.errorDetails.join("; ") : `${errors} error${errors > 1 ? "s" : ""}`;
          addToast("error", errMsg);
        } else if (forwarded > 0) {
          addToast("success", `${forwarded} new invoice${forwarded > 1 ? "s" : ""} found`);
        } else {
          addToast("info", "No new invoices found");
        }
        setLastRunAt(data.last_run_at || new Date().toISOString());
      }
      await fetchSummary();
      await fetchUnmatched();
    } catch {
      setToasts((prev) => prev.filter((t) => t.id !== scanToastId));
      addToast("error", "Request failed - check your connection");
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveService(data: Partial<InvoiceService>) {
    if (modalService === "new") {
      const res = await fetch("/api/invoices/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      // If created from an unmatched email, reassign that log to the new service
      if (res.ok && unmatchedForService) {
        const newService = await res.json();
        if (newService?.id) {
          await fetch(`/api/invoices/logs/${unmatchedForService.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_id: newService.id, status: "pending" }),
          });
          setUnmatched((prev) => prev.filter((u) => u.id !== unmatchedForService.id));
        }
        setUnmatchedForService(null);
      }
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

  async function handleMarkManual(logId: string | undefined, _serviceId: string) {
    if (logId) {
      await fetch(`/api/invoices/logs/${logId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
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

  async function handleUploadPdfs(serviceId: string, serviceName: string, files: File[]) {
    setUploading(true);
    setUploadProgress(null);
    let lastLogId: string | undefined;
    let succeeded = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length, filename: file.name });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("service_id", serviceId);
        formData.append("period", period);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55_000);

        const res = await fetch("/api/invoices/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          console.error("[upload] Error:", errData);
          addToast("error", `Upload failed for ${file.name}: ${errData.error || res.statusText}`);
          continue;
        }

        const data = await res.json();
        if (data.logId) lastLogId = data.logId;
        succeeded++;
      }

      await fetchSummary();
      setUploadTarget(null);
      if (lastLogId && succeeded > 0) {
        const label = succeeded > 1 ? `${succeeded} files` : files[0].name;
        const capturedLogId = lastLogId;
        addToast("success", `${label} uploaded for ${serviceName}`, {
          label: "Undo",
          onClick: () => handleDeleteLog(capturedLogId),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast("error", `Upload failed: ${msg.includes("abort") ? "Request timed out" : msg}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteLog(logId: string) {
    await fetch(`/api/invoices/logs/${logId}`, { method: "DELETE" });
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
    try {
      const res = await fetch("/api/invoices/forward-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      const forwarded = data.forwarded || 0;
      const errors = data.errors || 0;
      if (errors > 0) {
        addToast("error", `${forwarded} sent, ${errors} error${errors > 1 ? "s" : ""}`);
      } else if (forwarded > 0) {
        addToast("success", `${forwarded} invoice${forwarded > 1 ? "s" : ""} sent to Juni`);
      }
      await fetchSummary();
    } catch {
      addToast("error", "Failed to send invoices");
    } finally {
      setForwardingAll(false);
    }
  }

  async function handleBulkDone() {
    if (!confirm(`Mark all ${totalPendingCount} pending invoices as done?\n\nThis is for old entries that were handled outside the system.`)) return;
    setBulkDoneLoading(true);
    try {
      const res = await fetch("/api/invoices/bulk-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      addToast("success", `${data.updated || 0} invoices marked as done`);
      await fetchSummary();
      await fetchTotalPending();
    } catch {
      addToast("error", "Failed to bulk update");
    } finally {
      setBulkDoneLoading(false);
    }
  }

  function copyToClipboard(email: string, type: "receipts" | "invoices") {
    navigator.clipboard.writeText(email);
    setCopiedEmail(type);
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  // --- Computed values ---

  const done = summary.filter((r) => r.status === "sent" || r.status === "done").length;
  const needsAction = summary.length - summary.filter((r) => r.status === "not_due").length;
  const pct = needsAction > 0 ? Math.round((done / needsAction) * 100) : 100;

  const isLogPending = (l: InvoiceLog) =>
    l.status === "pending" && l.pdf_storage_path && !l.forwarded_at;
  const readyForJuniCount = summary.reduce(
    (sum, r) => r.service.forward_to !== "invoices"
      ? sum + r.logs.filter(isLogPending).length
      : sum,
    0
  );
  const readyInvoiceCount = summary.reduce(
    (sum, r) => r.service.forward_to === "invoices"
      ? sum + r.logs.filter(isLogPending).length
      : sum,
    0
  );
  const readyCount = readyForJuniCount + readyInvoiceCount;

  const counts = {
    total: summary.length,
    sent: summary.filter((r) => r.status === "sent" || r.status === "done").length,
    pending: readyCount,
    waiting: summary.filter((r) => r.status === "waiting").length,
    error: summary.filter((r) => r.status === "error").length,
    not_due: summary.filter((r) => r.status === "not_due").length,
  };

  const showMonthEndWarning = isMonthEndWarning() && period === currentPeriod() && counts.waiting > 0;

  const alertCount = (insights?.renewalAlerts.length || 0) +
    (insights?.pauseCandidates.length || 0) +
    (insights?.spendAnomalies.length || 0);
  const hasInsights = alertCount > 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and manage monthly service invoices
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
              disabled={period >= actualCurrentMonth()}
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

      {/* Action banner - pending invoices */}
      {(readyForJuniCount > 0 || readyInvoiceCount > 0) && (
        <div className="mb-4 px-4 py-3 rounded-lg flex items-center justify-between bg-indigo-50 border border-indigo-200">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span className="text-sm text-indigo-700">
              {readyForJuniCount > 0 && (
                <><span className="font-semibold">{readyForJuniCount}</span> receipt{readyForJuniCount > 1 ? "s" : ""} to send to Juni</>
              )}
              {readyForJuniCount > 0 && readyInvoiceCount > 0 && " + "}
              {readyInvoiceCount > 0 && (
                <><span className="font-semibold">{readyInvoiceCount}</span> unpaid invoice{readyInvoiceCount > 1 ? "s" : ""} to download</>
              )}
            </span>
          </div>
          {readyForJuniCount > 0 && (
            <button
              onClick={handleForwardAll}
              disabled={forwardingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {forwardingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send to Juni
            </button>
          )}
        </div>
      )}

      {/* Bulk cleanup banner - old pending logs across all periods */}
      {totalPendingCount > 0 && (
        <div className="mb-4 px-4 py-2.5 rounded-lg flex items-center justify-between bg-gray-50 border border-gray-200">
          <span className="text-sm text-gray-600">
            <span className="font-semibold">{totalPendingCount}</span> pending invoice{totalPendingCount > 1 ? "s" : ""} across all months
          </span>
          <button
            onClick={handleBulkDone}
            disabled={bulkDoneLoading}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {bulkDoneLoading ? "Updating..." : "Skip all - handled elsewhere"}
          </button>
        </div>
      )}

      {/* Progress Bar */}
      <div className={`bg-white border rounded-xl px-4 py-3 mb-4 ${
        showMonthEndWarning ? "border-amber-300" : "border-gray-200"
      }`}>
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
            {counts.sent > 0 && (
              <span className="text-emerald-600">
                <span className="font-semibold">{counts.sent}</span> sent
              </span>
            )}
            {counts.pending > 0 && (
              <span className="text-indigo-600">
                <span className="font-semibold">{counts.pending}</span> pending
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
                : showMonthEndWarning
                ? "bg-amber-400"
                : pct >= 75
                ? "bg-emerald-400"
                : pct >= 50
                ? "bg-amber-400"
                : "bg-amber-300"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          {showMonthEndWarning ? (
            <span className="text-[10px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {counts.waiting} service{counts.waiting > 1 ? "s" : ""} still waiting - month ends soon
            </span>
          ) : (
            <span />
          )}
          <span className="text-[10px] text-gray-400">{pct}%</span>
        </div>
      </div>

      {/* Service List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
          [...summary].sort((a, b) => {
            const doneStatuses = new Set(["sent", "done", "not_due", "dismissed"]);
            const aDone = doneStatuses.has(a.status) ? 1 : 0;
            const bDone = doneStatuses.has(b.status) ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            return a.service.name.localeCompare(b.service.name);
          }).map((row) => {
            const isSent = row.status === "sent" || row.status === "done";
            const isNotDue = row.status === "not_due";

            return (
              <div key={row.service.id} className="border-b border-gray-100 last:border-b-0">
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === row.service.id ? null : row.service.id)}
                >
                  {/* Service name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isNotDue ? "text-gray-400" : "text-gray-800"}`}>
                        {row.service.name}
                      </span>
                      {row.invoiceCount > 1 && (
                        <span className="text-[10px] text-gray-400">{row.invoiceCount}x</span>
                      )}
                      {row.service.billing_url && (
                        <a
                          href={row.service.billing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-indigo-400 hover:text-indigo-600 hover:underline"
                        >
                          billing &rarr;
                        </a>
                      )}
                    </div>
                    {row.service.forward_to === "invoices" && (
                      <span className="text-xs text-gray-400">Invoice</span>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Upload button for manual services */}
                  {row.service.is_manual_upload && !isSent && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadTarget({ serviceId: row.service.id, serviceName: row.service.name });
                      }}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Upload PDF"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}

                  {/* Menu button */}
                  <div className="relative flex-shrink-0">
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
                        className="absolute right-0 top-8 z-20 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
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
                          Upload PDF
                        </button>
                        {row.service.billing_url && (
                          <a
                            href={row.service.billing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            Billing page
                          </a>
                        )}
                        {row.status === "pending" && row.log?.id && (
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
                        {row.status === "error" && row.log?.id && (
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
                            Retry
                          </button>
                        )}
                        {!isSent && row.status !== "not_due" && (
                          <button
                            onClick={() => handleMarkManual(row.log?.id, row.service.id)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Skip - handled elsewhere
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
                            Delete log
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded log details */}
                {expandedRow === row.service.id && row.logs.length > 0 && (
                  <div className="bg-gray-50/60 border-t border-gray-100 px-5 py-3 space-y-2">
                    {row.logs.map((log, logIdx) => {
                      const logDone = log.status === "sent" || log.status === "done";
                      return (
                        <div
                          key={log.id}
                          className={`bg-white rounded-lg border px-4 py-3 flex items-start gap-3 ${
                            logDone ? "border-gray-100 opacity-60" : "border-gray-200"
                          }`}
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className={`text-sm font-medium truncate ${logDone ? "text-gray-400 line-through" : "text-gray-700"}`}>
                              {log.email_subject || `Invoice #${logIdx + 1}`}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                              {log.email_date && (
                                <span>{new Date(log.email_date).toLocaleDateString()}</span>
                              )}
                              {log.pdf_filename && (
                                <span className="text-gray-500">{log.pdf_filename}</span>
                              )}
                            </div>
                            {log.error_message && (
                              <p className="text-xs text-red-500">{log.error_message}</p>
                            )}
                          </div>
                          {/* Download button for invoice-type services */}
                          {log.pdf_filename && row.service.forward_to === "invoices" && (
                            <a
                              href={`/api/invoices/logs/${log.id}/download`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0 p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title={`Download ${log.pdf_filename}`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          {/* Status label */}
                          <div className="flex-shrink-0 text-right">
                            {logDone ? (
                              <span className="text-xs text-gray-400">
                                {log.forwarded_at ? new Date(log.forwarded_at).toLocaleDateString() : "Done"}
                              </span>
                            ) : log.status === "error" ? (
                              <span className="text-xs font-medium text-red-500">Error</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expanded: no log yet */}
                {expandedRow === row.service.id && row.logs.length === 0 && (
                  <div className="bg-gray-50/60 border-t border-gray-100 px-5 py-4 text-sm text-gray-400">
                    {row.service.billing_cycle === "usage_based"
                      ? "No charges this month."
                      : "No email received yet for this period."}
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

      {/* Unmatched emails - collapsible, below services */}
      {unmatched.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl mt-4 overflow-hidden">
          <button
            onClick={() => setExpandedRow(expandedRow === "__unmatched" ? null : "__unmatched")}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">
                {unmatched.length} unmatched email{unmatched.length > 1 ? "s" : ""}
              </span>
            </div>
            {expandedRow === "__unmatched" ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedRow === "__unmatched" && (
            <div className="border-t border-gray-100">
              {unmatched.map((u) => (
                <div key={u.id} className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{u.email_subject}</p>
                    <p className="text-xs text-gray-400">{u.email_from} &middot; {u.email_date ? new Date(u.email_date).toLocaleDateString() : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={() => {
                        setUnmatchedForService(u);
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
        </div>
      )}

      {/* Alerts / Insights - collapsible */}
      {hasInsights && insights && (
        <div className="bg-white border border-gray-200 rounded-xl mt-4 overflow-hidden">
          <button
            onClick={() => setInsightsExpanded(!insightsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">
                {alertCount} alert{alertCount > 1 ? "s" : ""}
              </span>
            </div>
            {insightsExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {insightsExpanded && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              {/* Renewal alerts */}
              {insights.renewalAlerts.map((a) => (
                <div key={a.service.id} className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-blue-50 text-blue-700">
                  <CalendarClock className="w-4 h-4 flex-shrink-0" />
                  <span>
                    <span className="font-medium">{a.service.name}</span> renewal in {a.daysUntil} days
                    {a.lastAmount && ` (~${fmtAmount(a.lastAmount, a.lastCurrency || "SEK")})`}
                  </span>
                </div>
              ))}

              {/* Spend anomalies */}
              {insights.spendAnomalies.map((a) => (
                <div key={a.service.id} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  a.percentChange > 0
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
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
                <div key={p.service.id} className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-gray-50 text-gray-600">
                  <PauseCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    <span className="font-medium">{p.service.name}</span> - no invoice in {p.monthsSinceLastInvoice} months. Still using it?
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Juni Email Info - collapsible */}
      <div className="bg-white border border-gray-200 rounded-xl mt-4 overflow-hidden">
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
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
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

      {/* Monthly summary - show when month is fully handled */}
      {pct === 100 && done > 0 && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-emerald-800 mb-2">
            All invoices handled for {formatPeriod(period)}
          </p>
          <div className="space-y-1">
            {summary
              .filter((r) => r.status === "sent" || r.status === "done")
              .map((r) => (
                <div key={r.service.id} className="flex items-center gap-2 text-sm text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span>{r.service.name}</span>
                  <span className="text-xs text-emerald-500">
                    {r.status === "done" ? "done" : "sent"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => !uploading && setUploadTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Invoice PDF</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload PDFs for <span className="font-medium">{uploadTarget.serviceName}</span> - {formatPeriod(period)}.
              They will be forwarded to Juni and marked as handled.
            </p>
            <label className="block">
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                {uploading ? (
                  <div className="flex flex-col items-center gap-1 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {uploadProgress && uploadProgress.total > 1 ? (
                      <>
                        <span className="text-sm">Uploading {uploadProgress.current}/{uploadProgress.total}...</span>
                        <span className="text-xs text-gray-400">{uploadProgress.filename}</span>
                      </>
                    ) : (
                      <span className="text-sm">Uploading and forwarding...</span>
                    )}
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to select PDF files</p>
                    <p className="text-xs text-gray-400 mt-1">You can select multiple files</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    handleUploadPdfs(uploadTarget.serviceId, uploadTarget.serviceName, Array.from(files));
                  }
                }}
              />
            </label>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => !uploading && setUploadTarget(null)}
                disabled={uploading}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
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
          prefill={modalService === "new" && unmatchedForService ? {
            name: extractServiceNameFromEmail(unmatchedForService.email_from || ""),
            senderPattern: extractDomainPattern(unmatchedForService.email_from || ""),
          } : undefined}
          onClose={() => { setModalService(null); setUnmatchedForService(null); }}
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

      {/* Toast container - fixed bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 shadow-lg border ${
                toast.type === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : toast.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-gray-200 text-gray-600"
              }`}
            >
              {toast.type === "error" ? (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              ) : toast.type === "success" ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              )}
              <span className="flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick();
                    dismissToast(toast.id);
                  }}
                  className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition-colors flex-shrink-0"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
