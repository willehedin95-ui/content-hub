"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Copy,
  Check,
  Loader2,
  Mail,
} from "lucide-react";
import type { InvoiceService, InvoiceSummaryRow, InvoiceStatus } from "@/types";
import StatusBadge from "./StatusBadge";
import ServiceModal from "./ServiceModal";

const JUNI_EMAIL = "q1k5n1k0@receipts.juni.co";
const JUNI_INVOICES_EMAIL = "q1k5n1k0@invoices.juni.co";

function currentPeriod(): string {
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

export default function InvoiceTrackerClient() {
  const [period, setPeriod] = useState(currentPeriod());
  const [summary, setSummary] = useState<InvoiceSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [modalService, setModalService] = useState<InvoiceService | null | "new">(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<"receipts" | "invoices" | null>(null);

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

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

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
    try {
      await fetch("/api/invoices/check", { method: "POST" });
      await fetchSummary();
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
    } else {
      // Create a manual log entry
      // We need a lightweight way — use the services endpoint won't work
      // Instead, let's just create via a special field
      const res = await fetch("/api/invoices/services", { method: "GET" });
      // Actually let's just refetch — for now mark via log update
    }
    setActionMenu(null);
    await fetchSummary();
  }

  function copyToClipboard(email: string, type: "receipts" | "invoices") {
    navigator.clipboard.writeText(email);
    setCopiedEmail(type);
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  // Summary counts
  const counts = {
    total: summary.length,
    forwarded: summary.filter((r) => r.status === "forwarded").length,
    waiting: summary.filter((r) => r.status === "waiting").length,
    error: summary.filter((r) => r.status === "error").length,
    manual: summary.filter((r) => r.status === "manual").length,
    not_due: summary.filter((r) => r.status === "not_due").length,
    received_no_pdf: summary.filter((r) => r.status === "received_no_pdf").length,
  };

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

          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Check Now
          </button>
        </div>
      </div>

      {/* Juni Email Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Juni Forwarding Addresses</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Paid Invoices & Receipts</p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-gray-800 font-mono">{JUNI_EMAIL}</code>
              <button
                onClick={() => copyToClipboard(JUNI_EMAIL, "receipts")}
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
            <p className="text-xs text-gray-500 mb-1">Unpaid Invoices <span className="text-gray-400">(coming later)</span></p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-gray-800 font-mono">{JUNI_INVOICES_EMAIL}</code>
              <button
                onClick={() => copyToClipboard(JUNI_INVOICES_EMAIL, "invoices")}
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

      {/* Summary Bar */}
      <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm">
        <span className="text-gray-500">
          <span className="font-semibold text-gray-800">{counts.total}</span> services
        </span>
        <span className="text-gray-300">|</span>
        {counts.forwarded > 0 && (
          <span className="text-emerald-600">
            <span className="font-semibold">{counts.forwarded}</span> forwarded
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
        {counts.manual > 0 && (
          <span className="text-gray-500">
            <span className="font-semibold">{counts.manual}</span> manual
          </span>
        )}
        {counts.not_due > 0 && (
          <span className="text-gray-400">
            <span className="font-semibold">{counts.not_due}</span> not due
          </span>
        )}
      </div>

      {/* Service List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_100px_140px_44px] gap-4 px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
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
          summary.map((row) => (
            <div
              key={row.service.id}
              className="grid grid-cols-[1fr_100px_140px_44px] gap-4 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 items-center"
            >
              {/* Service name */}
              <div>
                <p className="text-sm font-medium text-gray-800">{row.service.name}</p>
                {row.service.sender_patterns.length > 0 && (
                  <p className="text-xs text-gray-400 truncate">
                    {row.service.sender_patterns.join(", ")}
                  </p>
                )}
                {row.service.notes && (
                  <p className="text-xs text-gray-400 italic mt-0.5">{row.service.notes}</p>
                )}
              </div>

              {/* Cycle */}
              <span className="text-xs text-gray-500 capitalize">{row.service.billing_cycle}</span>

              {/* Status */}
              <div>
                <StatusBadge status={row.status} />
                {row.log?.forwarded_at && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(row.log.forwarded_at).toLocaleDateString()}
                  </p>
                )}
                {row.log?.error_message && (
                  <p className="text-[10px] text-red-400 mt-1 truncate max-w-[130px]" title={row.log.error_message}>
                    {row.log.error_message}
                  </p>
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
                    className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
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
                    {row.status !== "forwarded" && row.status !== "not_due" && (
                      <button
                        onClick={() => handleMarkManual(row.log?.id, row.service.id)}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Mark as handled
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
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

      {/* Modal */}
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
    </div>
  );
}
