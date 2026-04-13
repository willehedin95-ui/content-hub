"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  Plus,
  Download,
  FileText,
  Image,
  Check,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExpenseRow {
  id: string;
  description: string;
  date: string;
  receiptAmount: number | null;
  receiptCurrency: string | null;
  sekAmount: number | null;
  vat: number | null;
  category: "monthly" | "one_time" | "facebook_ads" | "google_ads";
  receiptReady: boolean;
  note: string;
  matched: boolean;
  receiptFile: string | null;
}

type Step = "upload" | "processing" | "review" | "download";

const CATEGORY_OPTIONS = [
  { value: "monthly", label: "Manadsprenumerationer" },
  { value: "one_time", label: "Engangskostnader" },
  { value: "facebook_ads", label: "Facebook ads" },
  { value: "google_ads", label: "Google ads" },
] as const;

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function defaultPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Image compression (keeps screenshots under Vercel's 4.5MB body limit)
// ---------------------------------------------------------------------------
function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    // Skip non-image files
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      // Skip if already small enough
      if (img.width <= maxWidth && file.size < 500_000) {
        resolve(file);
        return;
      }
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const name = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ExpensesTab() {
  const [step, setStep] = useState<Step>("upload");
  const [person, setPerson] = useState<"William" | "Rasmus">("William");
  const [period, setPeriod] = useState(defaultPeriod);
  const [files, setFiles] = useState<{ file: File; type: "receipt" | "bank" }[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [unmatchedBank, setUnmatchedBank] = useState<
    { description: string; date: string; amount: number }[]
  >([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"excel" | "zip" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
      .filter((f) => {
        const ext = f.name.toLowerCase().split(".").pop();
        return ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext || "");
      })
      .map((f) => {
        const ext = f.name.toLowerCase().split(".").pop();
        return { file: f, type: (ext === "pdf" ? "receipt" : "bank") as "receipt" | "bank" };
      });
    setFiles((prev) => [...prev, ...arr]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const toggleFileType = useCallback((idx: number) => {
    setFiles((prev) =>
      prev.map((f, i) =>
        i === idx ? { ...f, type: f.type === "receipt" ? "bank" : "receipt" } : f
      )
    );
  }, []);

  const receiptCount = files.filter((f) => f.type === "receipt").length;
  const bankCount = files.filter((f) => f.type === "bank").length;

  // -------------------------------------------------------------------------
  // Process files
  // -------------------------------------------------------------------------
  async function handleProcess() {
    setProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("month", period);
      for (const f of files) {
        // Compress images to stay under Vercel's 4.5MB body limit
        const processed = await compressImage(f.file);
        if (f.type === "receipt") {
          formData.append("receipts", processed);
        } else {
          formData.append("bank_statements", processed);
        }
      }

      const res = await fetch("/api/expenses/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setExpenses(data.expenses || []);
      setUnmatchedBank(data.unmatchedBank || []);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Expense editing
  // -------------------------------------------------------------------------
  function updateExpense(id: string, updates: Partial<ExpenseRow>) {
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  }

  function deleteExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function addManualRow() {
    setExpenses((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        date: "",
        receiptAmount: null,
        receiptCurrency: null,
        sekAmount: null,
        vat: null,
        category: "one_time",
        receiptReady: false,
        note: "",
        matched: false,
        receiptFile: null,
      },
    ]);
  }

  // -------------------------------------------------------------------------
  // Downloads
  // -------------------------------------------------------------------------
  async function downloadExcel() {
    setDownloading("excel");
    try {
      const res = await fetch("/api/expenses/generate-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, month: period, expenses }),
      });
      if (!res.ok) throw new Error("Failed to generate Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] || "expenses.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  }

  async function downloadReceipts() {
    setDownloading("zip");
    try {
      const receiptFiles = files.filter((f) => f.type === "receipt");
      if (receiptFiles.length === 0) {
        setError("No receipts to download");
        setDownloading(null);
        return;
      }
      const formData = new FormData();
      formData.append("person", person);
      formData.append("month", period);
      for (const f of receiptFiles) {
        formData.append("files", f.file);
      }
      const res = await fetch("/api/expenses/download-receipts", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to generate ZIP");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Kvitton ${person} ${period}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------------------
  const totalSEK = expenses.reduce((sum, e) => sum + (e.sekAmount || 0), 0);
  const matchedCount = expenses.filter((e) => e.matched).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto px-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload receipts + bank statements to generate an expense Excel
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: Upload                                                      */}
      {/* ================================================================= */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Person + Month */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-6">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  Person
                </label>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  {(["William", "Rasmus"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPerson(p)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        person === p
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  Month
                </label>
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
                  <button
                    onClick={() => setPeriod(shiftPeriod(period, -1))}
                    className="p-1 text-gray-500 hover:text-gray-700 rounded"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                    {formatPeriod(period)}
                  </span>
                  <button
                    onClick={() => setPeriod(shiftPeriod(period, 1))}
                    className="p-1 text-gray-500 hover:text-gray-700 rounded"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-indigo-400", "bg-indigo-50");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove(
                "border-indigo-400",
                "bg-indigo-50"
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove(
                "border-indigo-400",
                "bg-indigo-50"
              );
              addFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDFs default to receipts, images to bank statements - click to change
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {files.length} file{files.length !== 1 ? "s" : ""}{" "}
                  <span className="text-gray-400 font-normal">
                    ({receiptCount} receipt{receiptCount !== 1 ? "s" : ""},{" "}
                    {bankCount} bank statement{bankCount !== 1 ? "s" : ""})
                  </span>
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {files.map((f, idx) => (
                  <div
                    key={`${f.file.name}-${idx}`}
                    className="px-4 py-2 flex items-center gap-3"
                  >
                    {f.type === "receipt" ? (
                      <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <Image className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-700 truncate flex-1">
                      {f.file.name}
                    </span>
                    <button
                      onClick={() => toggleFileType(idx)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        f.type === "receipt"
                          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                          : "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
                      }`}
                    >
                      {f.type === "receipt" ? "Receipt" : "Bank"}
                    </button>
                    <button
                      onClick={() => removeFile(idx)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Process button */}
          {files.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleProcess}
                disabled={processing || receiptCount === 0}
                className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing {files.length} files...
                  </>
                ) : (
                  "Process Files"
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: Processing (shown inline, step stays "upload")              */}
      {/* ================================================================= */}

      {/* ================================================================= */}
      {/* STEP: Review                                                      */}
      {/* ================================================================= */}
      {step === "review" && (
        <div className="space-y-4">
          {/* Status bar */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-700">
                <span className="font-semibold">{expenses.length}</span>{" "}
                expense{expenses.length !== 1 ? "s" : ""}
              </span>
              <span className="text-emerald-600">
                <span className="font-semibold">{matchedCount}</span> matched
              </span>
              {expenses.length - matchedCount > 0 && (
                <span className="text-amber-600">
                  <span className="font-semibold">
                    {expenses.length - matchedCount}
                  </span>{" "}
                  need SEK amount
                </span>
              )}
              <span className="text-gray-500">
                Total:{" "}
                <span className="font-semibold">
                  {totalSEK.toLocaleString("sv-SE", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  SEK
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStep("upload");
                  setExpenses([]);
                  setUnmatchedBank([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Start over
              </button>
            </div>
          </div>

          {/* Unmatched bank transactions hint */}
          {unmatchedBank.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <summary className="px-4 py-2.5 text-sm font-medium text-amber-700 cursor-pointer">
                {unmatchedBank.length} unmatched bank transaction
                {unmatchedBank.length !== 1 ? "s" : ""} (for reference)
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {unmatchedBank.map((tx, i) => (
                  <div
                    key={i}
                    className="text-xs text-amber-600 flex items-center gap-2"
                  >
                    <span className="font-mono">{tx.date}</span>
                    <span className="truncate">{tx.description}</span>
                    <span className="ml-auto font-medium">
                      {tx.amount.toLocaleString("sv-SE", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      SEK
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Expense table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[200px]">
                      Description
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[100px]">
                      Date
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-[90px]">
                      Receipt
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-[100px]">
                      SEK
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-[80px]">
                      MOMS
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[160px]">
                      Category
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-[40px]">
                      PDF
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[120px]">
                      Note
                    </th>
                    <th className="w-[40px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.map((exp) => (
                    <tr
                      key={exp.id}
                      className={
                        !exp.matched && !exp.sekAmount
                          ? "bg-amber-50/30"
                          : ""
                      }
                    >
                      {/* Description */}
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={exp.description}
                          onChange={(e) =>
                            updateExpense(exp.id, {
                              description: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-400 focus:outline-none"
                        />
                      </td>

                      {/* Date */}
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={exp.date}
                          onChange={(e) =>
                            updateExpense(exp.id, { date: e.target.value })
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-400 focus:outline-none"
                        />
                      </td>

                      {/* Receipt amount */}
                      <td className="px-3 py-1.5 text-right text-xs text-gray-400">
                        {exp.receiptAmount != null
                          ? `${exp.receiptAmount} ${exp.receiptCurrency || ""}`
                          : "-"}
                      </td>

                      {/* SEK amount */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          {exp.matched ? (
                            <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          )}
                          <input
                            type="number"
                            step="0.01"
                            value={exp.sekAmount ?? ""}
                            onChange={(e) =>
                              updateExpense(exp.id, {
                                sekAmount: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                                matched: true,
                              })
                            }
                            placeholder="0.00"
                            className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* VAT */}
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={exp.vat ?? ""}
                          onChange={(e) =>
                            updateExpense(exp.id, {
                              vat: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          placeholder="-"
                          className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:border-indigo-400 focus:outline-none"
                        />
                      </td>

                      {/* Category */}
                      <td className="px-3 py-1.5">
                        <select
                          value={exp.category}
                          onChange={(e) =>
                            updateExpense(exp.id, {
                              category: e.target
                                .value as ExpenseRow["category"],
                            })
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-400 focus:outline-none bg-white"
                        >
                          {CATEGORY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* PDF ready */}
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={exp.receiptReady}
                          onChange={(e) =>
                            updateExpense(exp.id, {
                              receiptReady: e.target.checked,
                            })
                          }
                          className="rounded border-gray-300"
                        />
                      </td>

                      {/* Note */}
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={exp.note}
                          onChange={(e) =>
                            updateExpense(exp.id, { note: e.target.value })
                          }
                          placeholder="-"
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-400 focus:outline-none"
                        />
                      </td>

                      {/* Delete */}
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => deleteExpense(exp.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add row + totals */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={addManualRow}
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add row
              </button>
              <div className="text-sm text-gray-700">
                Total:{" "}
                <span className="font-bold">
                  {totalSEK.toLocaleString("sv-SE", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  SEK
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setStep("download")}
              disabled={expenses.length === 0}
              className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Continue to Download
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: Download                                                    */}
      {/* ================================================================= */}
      {step === "download" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Download Files
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {person} - {formatPeriod(period)} -{" "}
              {expenses.length} expense{expenses.length !== 1 ? "s" : ""},{" "}
              {totalSEK.toLocaleString("sv-SE", { minimumFractionDigits: 2 })}{" "}
              SEK total
            </p>

            <div className="space-y-3">
              {/* Excel download */}
              <button
                onClick={downloadExcel}
                disabled={downloading !== null}
                className="w-full flex items-center gap-4 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Download Excel
                  </p>
                  <p className="text-xs text-gray-500">
                    Egna utlagg {person} {formatPeriod(period)}.xlsx
                  </p>
                </div>
                {downloading === "excel" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <Download className="w-5 h-5 text-emerald-600" />
                )}
              </button>

              {/* ZIP download */}
              {receiptCount > 0 && (
                <button
                  onClick={downloadReceipts}
                  disabled={downloading !== null}
                  className="w-full flex items-center gap-4 px-4 py-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Download Receipts (ZIP)
                    </p>
                    <p className="text-xs text-gray-500">
                      {receiptCount} PDF{receiptCount !== 1 ? "s" : ""} - ready
                      for Dropbox
                    </p>
                  </div>
                  {downloading === "zip" ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  ) : (
                    <Download className="w-5 h-5 text-blue-600" />
                  )}
                </button>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setStep("review")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Back to edit
              </button>
              <button
                onClick={() => {
                  setStep("upload");
                  setFiles([]);
                  setExpenses([]);
                  setUnmatchedBank([]);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Start new report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
