"use client";

import { useState } from "react";
import { Save, CheckCircle2, Plus, X } from "lucide-react";
import type { ProductFull } from "@/types";

interface Props {
  product: ProductFull;
  onUpdate: (updated: Partial<ProductFull>) => void;
}

export default function ProductInfoTab({ product, onUpdate }: Props) {
  const [form, setForm] = useState({
    name: product.name,
    tagline: product.tagline ?? "",
    description: product.description ?? "",
    benefits: product.benefits ?? [],
    usps: product.usps ?? [],
    claims: product.claims ?? [],
    certifications: product.certifications ?? [],
    ingredients: product.ingredients ?? "",
    target_audience: product.target_audience ?? "",
    competitor_keywords: product.competitor_keywords ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Basic info */}
      <Section title="Basic Info">
        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </Field>
        <Field label="Tagline">
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            placeholder="Short product tagline..."
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Full product description..."
            rows={4}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
          />
        </Field>
        <Field label="Target Audience">
          <textarea
            value={form.target_audience}
            onChange={(e) =>
              setForm((f) => ({ ...f, target_audience: e.target.value }))
            }
            placeholder="Who is this product for?"
            rows={2}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
          />
        </Field>
        <Field label="Ingredients / Materials">
          <textarea
            value={form.ingredients}
            onChange={(e) =>
              setForm((f) => ({ ...f, ingredients: e.target.value }))
            }
            placeholder="Materials, composition..."
            rows={2}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
          />
        </Field>
      </Section>

      {/* Benefits */}
      <Section title="Benefits">
        <ListEditor
          items={form.benefits}
          onChange={(benefits) => setForm((f) => ({ ...f, benefits }))}
          placeholder="Add a benefit..."
        />
      </Section>

      {/* USPs */}
      <Section title="Unique Selling Points">
        <ListEditor
          items={form.usps}
          onChange={(usps) => setForm((f) => ({ ...f, usps }))}
          placeholder="Add a USP..."
        />
      </Section>

      {/* Claims */}
      <Section title="Claims">
        <ListEditor
          items={form.claims}
          onChange={(claims) => setForm((f) => ({ ...f, claims }))}
          placeholder='Add a claim (e.g. "97% sleep better")...'
        />
      </Section>

      {/* Certifications */}
      <Section title="Certifications">
        <ListEditor
          items={form.certifications}
          onChange={(certifications) =>
            setForm((f) => ({ ...f, certifications }))
          }
          placeholder="Add a certification (e.g. OEKO-TEX)..."
        />
      </Section>

      {/* Competitor keywords */}
      <Section title="Competitor Keywords">
        <p className="text-xs text-gray-400 mb-2">
          Terms competitors use that should be replaced with your product when
          swiping pages
        </p>
        <ListEditor
          items={form.competitor_keywords}
          onChange={(competitor_keywords) =>
            setForm((f) => ({ ...f, competitor_keywords }))
          }
          placeholder="Add a competitor keyword..."
        />
      </Section>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {saved ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
      </button>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function handleAdd() {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-gray-700"
            >
              {item}
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={placeholder}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 flex-1"
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="text-gray-500 hover:text-indigo-600 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
