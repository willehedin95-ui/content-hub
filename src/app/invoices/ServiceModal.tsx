"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { InvoiceService } from "@/types";

interface ServiceModalProps {
  service: InvoiceService | null; // null = create new
  onClose: () => void;
  onSave: (data: Partial<InvoiceService>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function ServiceModal({ service, onClose, onSave, onDelete }: ServiceModalProps) {
  const [name, setName] = useState(service?.name || "");
  const [senderPatterns, setSenderPatterns] = useState<string[]>(service?.sender_patterns || [""]);
  const [subjectPatterns, setSubjectPatterns] = useState<string[]>(service?.subject_patterns || []);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual" | "quarterly">(service?.billing_cycle || "monthly");
  const [anchorMonth, setAnchorMonth] = useState<number | null>(service?.billing_anchor_month ?? null);
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
      await onSave({
        name: name.trim(),
        sender_patterns: senderPatterns.filter((p) => p.trim()),
        subject_patterns: subjectPatterns.filter((p) => p.trim()),
        billing_cycle: billingCycle as "monthly" | "annual" | "quarterly",
        billing_anchor_month: billingCycle !== "monthly" ? anchorMonth : null,
        notes: notes.trim() || null,
        is_active: service?.is_active ?? true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function addSenderPattern() {
    setSenderPatterns([...senderPatterns, ""]);
  }
  function removeSenderPattern(i: number) {
    setSenderPatterns(senderPatterns.filter((_, idx) => idx !== i));
  }
  function updateSenderPattern(i: number, val: string) {
    const copy = [...senderPatterns];
    copy[i] = val;
    setSenderPatterns(copy);
  }

  function addSubjectPattern() {
    setSubjectPatterns([...subjectPatterns, ""]);
  }
  function removeSubjectPattern(i: number) {
    setSubjectPatterns(subjectPatterns.filter((_, idx) => idx !== i));
  }
  function updateSubjectPattern(i: number, val: string) {
    const copy = [...subjectPatterns];
    copy[i] = val;
    setSubjectPatterns(copy);
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

        <div className="px-5 py-4 space-y-4">
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

          {/* Sender Patterns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sender Email Patterns
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Match emails where the sender contains this text (e.g. &quot;@vercel.com&quot;)
            </p>
            {senderPatterns.map((p, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={p}
                  onChange={(e) => updateSenderPattern(i, e.target.value)}
                  placeholder="@vercel.com"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {senderPatterns.length > 1 && (
                  <button
                    onClick={() => removeSenderPattern(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addSenderPattern}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add pattern
            </button>
          </div>

          {/* Subject Patterns (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject Keywords <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Only match if subject contains one of these words. Leave empty to match all emails from sender.
            </p>
            {subjectPatterns.map((p, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={p}
                  onChange={(e) => updateSubjectPattern(i, e.target.value)}
                  placeholder="invoice"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={() => removeSubjectPattern(i)}
                  className="p-1.5 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addSubjectPattern}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add keyword
            </button>
          </div>

          {/* Billing Cycle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
            <select
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as "monthly" | "annual" | "quarterly")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* Anchor Month (for non-monthly) */}
          {billingCycle !== "monthly" && (
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
