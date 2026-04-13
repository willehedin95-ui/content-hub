"use client";

import { useState, useRef } from "react";
import {
  X,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  ChevronDown,
  FileText,
} from "lucide-react";
import type { InvoiceService } from "@/types";

interface AnalysisResult {
  filename: string;
  fileIndex: number;
  serviceName: string | null;
  serviceId: string | null;
  period: string | null;
  amount: number | null;
  currency: string | null;
  confidence: "high" | "medium" | "low";
}

interface BulkUploadModalProps {
  onClose: () => void;
  onComplete: () => void;
}

type Step = "upload" | "analyzing" | "review" | "confirming" | "done";

function fmtAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

export default function BulkUploadModal({ onClose, onComplete }: BulkUploadModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [services, setServices] = useState<InvoiceService[]>([]);
  const [editableResults, setEditableResults] = useState<AnalysisResult[]>([]);
  const [confirmResults, setConfirmResults] = useState<{ filename: string; success: boolean; error?: string }[]>([]);
  const [wasSaveOnly, setWasSaveOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(newFiles: FileList | File[]) {
    const pdfs = Array.from(newFiles).filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfs.length > 0) {
      setFiles((prev) => [...prev, ...pdfs]);
    }
  }

  async function handleAnalyze() {
    if (files.length === 0) return;
    setStep("analyzing");

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const res = await fetch("/api/invoices/bulk-analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResults(data.results || []);
      setServices(data.services || []);
      setEditableResults(data.results || []);
      setStep("review");
    } catch {
      setStep("upload");
    }
  }

  async function handleConfirm(saveOnly = false) {
    // Filter out items without a service or period
    const validItems = editableResults.filter((r) => r.serviceId && r.period);
    if (validItems.length === 0) return;

    setWasSaveOnly(saveOnly);
    setStep("confirming");

    const formData = new FormData();
    // Attach files
    for (let i = 0; i < files.length; i++) {
      formData.append(`file_${i}`, files[i]);
    }
    // Attach items JSON
    const items = validItems.map((r) => ({
      filename: r.filename,
      serviceId: r.serviceId,
      period: r.period,
      amount: r.amount,
      currency: r.currency,
    }));
    formData.append("items", JSON.stringify(items));
    if (saveOnly) {
      formData.append("save_only", "true");
    }

    try {
      const res = await fetch("/api/invoices/bulk-confirm", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setConfirmResults(data.results || []);
      setStep("done");
    } catch {
      setStep("review");
    }
  }

  function updateResult(index: number, updates: Partial<AnalysisResult>) {
    setEditableResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    );
  }

  const validCount = editableResults.filter((r) => r.serviceId && r.period).length;
  const successCount = confirmResults.filter((r) => r.success).length;
  const errorCount = confirmResults.filter((r) => !r.success).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Upload Invoices</h2>
            <p className="text-sm text-gray-500">
              {step === "upload" && "Drop PDF files — AI will identify each service and period"}
              {step === "analyzing" && "Analyzing PDFs..."}
              {step === "review" && "Review and adjust before forwarding to Juni"}
              {step === "confirming" && (wasSaveOnly ? "Saving to services..." : "Forwarding to Juni...")}
              {step === "done" && (wasSaveOnly ? "Saved to services" : "Upload complete")}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Upload step */}
          {step === "upload" && (
            <div>
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? "border-indigo-400 bg-indigo-50/50"
                    : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">
                  Drop PDF invoices here or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Multiple files supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                  }}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 truncate">{f.name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analyzing step */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm text-gray-600">
                Extracting text and analyzing {files.length} PDF{files.length > 1 ? "s" : ""} with AI...
              </p>
            </div>
          )}

          {/* Review step */}
          {step === "review" && (
            <div className="space-y-3">
              {editableResults.map((r, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 ${
                    r.serviceId && r.period
                      ? "border-gray-200 bg-white"
                      : "border-amber-200 bg-amber-50/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">{r.filename}</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        r.confidence === "high"
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : r.confidence === "medium"
                          ? "bg-amber-50 text-amber-600 border border-amber-200"
                          : "bg-red-50 text-red-600 border border-red-200"
                      }`}
                    >
                      {r.confidence} confidence
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {/* Service */}
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Service</label>
                      <div className="relative">
                        <select
                          value={r.serviceId || ""}
                          onChange={(e) => updateResult(i, { serviceId: e.target.value || null })}
                          className={`w-full px-2 py-1.5 text-sm border rounded-lg appearance-none pr-7 ${
                            r.serviceId ? "border-gray-200 text-gray-700" : "border-amber-300 text-amber-700 bg-amber-50"
                          }`}
                        >
                          <option value="">— Select —</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                      {r.serviceName && !r.serviceId && (
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          AI detected: &ldquo;{r.serviceName}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Period */}
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Period</label>
                      <input
                        type="month"
                        value={r.period || ""}
                        onChange={(e) => updateResult(i, { period: e.target.value || null })}
                        className={`w-full px-2 py-1.5 text-sm border rounded-lg ${
                          r.period ? "border-gray-200 text-gray-700" : "border-amber-300 text-amber-700 bg-amber-50"
                        }`}
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={r.amount ?? ""}
                        onChange={(e) => updateResult(i, { amount: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700"
                        placeholder="—"
                      />
                    </div>

                    {/* Currency */}
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Currency</label>
                      <input
                        type="text"
                        value={r.currency || ""}
                        onChange={(e) => updateResult(i, { currency: e.target.value || null })}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700"
                        placeholder="USD"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirming step */}
          {step === "confirming" && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm text-gray-600">
                {wasSaveOnly
                  ? `Saving ${validCount} invoice${validCount > 1 ? "s" : ""} to services...`
                  : `Forwarding ${validCount} invoice${validCount > 1 ? "s" : ""} to Juni...`}
              </p>
            </div>
          )}

          {/* Done step */}
          {step === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-4">
                {successCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    <Check className="w-4 h-4" />
                    {successCount} {wasSaveOnly ? "saved" : "sent"}
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    {errorCount} failed
                  </div>
                )}
              </div>

              {confirmResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    r.success
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {r.success ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="truncate">{r.filename}</span>
                  {r.error && (
                    <span className="text-xs text-red-500 ml-auto flex-shrink-0">
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <div className="text-xs text-gray-400">
            {step === "upload" && files.length > 0 && `${files.length} file${files.length > 1 ? "s" : ""} selected`}
            {step === "review" && `${validCount} of ${editableResults.length} ready`}
          </div>
          <div className="flex items-center gap-2">
            {step === "done" ? (
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-700"
                >
                  Cancel
                </button>
                {step === "upload" && (
                  <button
                    onClick={handleAnalyze}
                    disabled={files.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Analyze {files.length > 0 ? `${files.length} PDF${files.length > 1 ? "s" : ""}` : ""}
                  </button>
                )}
                {step === "review" && (
                  <>
                    <button
                      onClick={() => handleConfirm(true)}
                      disabled={validCount === 0}
                      className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      Save to services
                    </button>
                    <button
                      onClick={() => handleConfirm(false)}
                      disabled={validCount === 0}
                      className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Forward {validCount} to Juni
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
