"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";
import type { InvoiceService, InvoiceForwardTarget } from "@/types";

type ConditionField = "sender" | "subject";

interface Condition {
  field: ConditionField;
  value: string;
}

const FIELD_OPTIONS: { value: ConditionField; label: string; placeholder: string }[] = [
  { value: "sender", label: "Sender address contains", placeholder: "@vercel.com" },
  { value: "subject", label: "Subject contains", placeholder: "invoice" },
];

function buildConditionsFromService(service: InvoiceService | null): Condition[] {
  if (!service) return [{ field: "sender", value: "" }];
  const conditions: Condition[] = [];
  for (const p of service.sender_patterns) {
    conditions.push({ field: "sender", value: p });
  }
  for (const p of service.subject_patterns) {
    conditions.push({ field: "subject", value: p });
  }
  return conditions.length > 0 ? conditions : [{ field: "sender", value: "" }];
}

function splitConditions(conditions: Condition[]): {
  sender_patterns: string[];
  subject_patterns: string[];
} {
  const sender_patterns: string[] = [];
  const subject_patterns: string[] = [];
  for (const c of conditions) {
    const v = c.value.trim();
    if (!v) continue;
    if (c.field === "sender") sender_patterns.push(v);
    else subject_patterns.push(v);
  }
  return { sender_patterns, subject_patterns };
}

interface ServiceModalProps {
  service: InvoiceService | null; // null = create new
  prefill?: { name?: string; senderPattern?: string };
  onClose: () => void;
  onSave: (data: Partial<InvoiceService>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function ServiceModal({ service, prefill, onClose, onSave, onDelete }: ServiceModalProps) {
  const [name, setName] = useState(service?.name || prefill?.name || "");
  const [isManualUpload, setIsManualUpload] = useState(service?.is_manual_upload ?? false);
  const [conditions, setConditions] = useState<Condition[]>(
    service
      ? buildConditionsFromService(service)
      : prefill?.senderPattern
      ? [{ field: "sender" as ConditionField, value: prefill.senderPattern }]
      : [{ field: "sender" as ConditionField, value: "" }]
  );
  const [forwardTo, setForwardTo] = useState<InvoiceForwardTarget>(service?.forward_to || "receipts");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual" | "quarterly" | "usage_based" | "one_time">(service?.billing_cycle || "monthly");
  const [anchorMonth, setAnchorMonth] = useState<number | null>(service?.billing_anchor_month ?? null);
  const [matchMode, setMatchMode] = useState<"any" | "all">(service?.match_mode || "any");
  const [billingUrl, setBillingUrl] = useState(service?.billing_url || "");
  const [notes, setNotes] = useState(service?.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { sender_patterns, subject_patterns } = splitConditions(conditions);
      await onSave({
        name: name.trim(),
        sender_patterns: isManualUpload ? [] : sender_patterns,
        subject_patterns: isManualUpload ? [] : subject_patterns,
        forward_to: forwardTo,
        is_manual_upload: isManualUpload,
        match_mode: matchMode,
        billing_url: billingUrl.trim() || null,
        billing_cycle: billingCycle,
        billing_anchor_month: billingCycle !== "monthly" && billingCycle !== "usage_based" && billingCycle !== "one_time" ? anchorMonth : null,
        notes: notes.trim() || null,
        is_active: service?.is_active ?? true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function addCondition() {
    setConditions([...conditions, { field: "sender", value: "" }]);
  }

  function removeCondition(i: number) {
    setConditions(conditions.filter((_, idx) => idx !== i));
  }

  function updateConditionField(i: number, field: ConditionField) {
    const copy = [...conditions];
    copy[i] = { ...copy[i], field };
    setConditions(copy);
  }

  function updateConditionValue(i: number, value: string) {
    const copy = [...conditions];
    copy[i] = { ...copy[i], value };
    setConditions(copy);
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {service ? "Edit Service" : "Add Service"}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vercel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Invoice Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Source</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsManualUpload(false)}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  !isManualUpload
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                Auto (email scan)
              </button>
              <button
                type="button"
                onClick={() => setIsManualUpload(true)}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  isManualUpload
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                Manual upload
              </button>
            </div>
            {isManualUpload && (
              <p className="text-xs text-gray-400 mt-2">
                This service doesn&apos;t send invoices by email. You&apos;ll upload PDFs manually each period.
              </p>
            )}
          </div>

          {/* Billing URL (manual upload only) */}
          {isManualUpload && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing URL <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={billingUrl}
                onChange={(e) => setBillingUrl(e.target.value)}
                placeholder="https://billing.stripe.com/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Quick link to download receipts from this service.
              </p>
            </div>
          )}

          {/* Match Conditions (hidden for manual upload) */}
          {!isManualUpload && <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Match Conditions
              </label>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setMatchMode("any")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    matchMode === "any"
                      ? "bg-white text-gray-900 font-medium shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Match any
                </button>
                <button
                  type="button"
                  onClick={() => setMatchMode("all")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    matchMode === "all"
                      ? "bg-white text-gray-900 font-medium shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Match all
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {matchMode === "any"
                ? "An email matching any one of these conditions will be detected."
                : "An email must match all conditions to be detected."}
            </p>

            <div className="space-y-2">
              {conditions.map((condition, i) => {
                const fieldOption = FIELD_OPTIONS.find((f) => f.value === condition.field)!;
                return (
                  <div key={i}>
                    {i > 0 && (
                      <div className="flex items-center justify-center my-1">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          matchMode === "any"
                            ? "bg-blue-50 text-blue-500"
                            : "bg-amber-50 text-amber-500"
                        }`}>
                          {matchMode === "any" ? "OR" : "AND"}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <div className="relative min-w-[200px]">
                        <select
                          value={condition.field}
                          onChange={(e) => updateConditionField(i, e.target.value as ConditionField)}
                          className="w-full appearance-none bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => updateConditionValue(i, e.target.value)}
                        placeholder={fieldOption.placeholder}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {conditions.length > 1 && (
                        <button
                          onClick={() => removeCondition(i)}
                          className="p-1.5 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={addCondition}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add condition
            </button>
          </div>}

          {/* Forward To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Forward To</label>
            <p className="text-xs text-gray-400 mb-2">
              Choose which Juni inbox to forward this invoice to.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForwardTo("receipts")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  forwardTo === "receipts"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                Paid (Receipts)
              </button>
              <button
                type="button"
                onClick={() => setForwardTo("invoices")}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  forwardTo === "invoices"
                    ? "bg-amber-50 border-amber-300 text-amber-700 font-medium"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                Unpaid (Invoices)
              </button>
            </div>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as "monthly" | "annual" | "quarterly" | "usage_based" | "one_time")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="usage_based">Usage-based (multiple per month)</option>
              <option value="one_time">One-time purchase</option>
            </select>
          </div>

          {/* Anchor Month (for non-monthly, non-usage-based) */}
          {billingCycle !== "monthly" && billingCycle !== "usage_based" && billingCycle !== "one_time" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {billingCycle === "annual" ? "Invoice Month" : "First Invoice Month"}
              </label>
              <select
                value={anchorMonth ?? ""}
                onChange={(e) => setAnchorMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select month...</option>
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Shared with brother, uses personal email"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <div>
            {service && onDelete && (
              <button
                onClick={async () => {
                  if (confirm(`Delete "${service.name}"?`)) {
                    await onDelete();
                    onClose();
                  }
                }}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Delete service
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving..." : service ? "Save Changes" : "Add Service"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
