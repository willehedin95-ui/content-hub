"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Copy,
  FlaskConical,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { LANGUAGES, Language } from "@/types";
import { supabase } from "@/lib/supabase";

interface PageOption {
  translation_id: string;
  page_id: string;
  page_name: string;
  page_type: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewABTestClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledPageId = searchParams.get("pageId");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [language, setLanguage] = useState<Language>("sv");
  const [controlId, setControlId] = useState("");
  const [mode, setMode] = useState<"compare" | "variation">("compare");
  const [variantId, setVariantId] = useState("");
  const [split, setSplit] = useState(50);
  const [description, setDescription] = useState("");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(name));
    }
  }, [name, slugManual]);

  // Fetch pages with translations for selected language
  useEffect(() => {
    async function fetchPages() {
      const { data } = await supabase
        .from("translations")
        .select("id, language, translated_html, page_id, pages (id, name, page_type, slug)")
        .eq("language", language)
        .not("translated_html", "is", null);

      if (data) {
        const options: PageOption[] = data
          .filter((t: Record<string, unknown>) => t.pages && t.translated_html)
          .map((t: Record<string, unknown>) => {
            const p = t.pages as Record<string, string>;
            return {
              translation_id: t.id as string,
              page_id: p.id,
              page_name: p.name,
              page_type: p.page_type,
              slug: p.slug,
            };
          });
        setPages(options);

        // Pre-select control if pageId is in query params
        if (prefilledPageId) {
          const match = options.find((o) => o.page_id === prefilledPageId);
          if (match) setControlId(match.translation_id);
        }
      }
    }
    fetchPages();
    if (!prefilledPageId) {
      setControlId("");
    }
    setVariantId("");
  }, [language, prefilledPageId]);

  async function handleCreate() {
    if (!name.trim() || !slug.trim() || !controlId) {
      setError("Please fill in all required fields");
      return;
    }
    if (mode === "compare" && !variantId) {
      setError("Please fill in all required fields");
      return;
    }
    if (mode === "compare" && controlId === variantId) {
      setError("Variant A and Variant B must be different pages");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        slug: slug.trim(),
        language,
        control_id: controlId,
        split,
        description: description.trim() || undefined,
      };

      if (mode === "compare") {
        body.variant_id = variantId;
      } else {
        body.mode = "variation";
      }

      const res = await fetch("/api/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create test");
        return;
      }

      if (mode === "variation") {
        router.push(`/pages/${data.variant_page_id}/edit/${data.variant_language}?variant=b`);
      } else {
        router.push(`/ab-tests/${data.id}`);
      }
    } catch {
      setError("Failed to create test");
    } finally {
      setLoading(false);
    }
  }

  const langInfo = LANGUAGES.find((l) => l.value === language);
  const availableLanguages = LANGUAGES.filter((l) => l.domain);

  return (
    <div className="p-8 max-w-2xl">
      {/* Back */}
      <Link
        href="/ab-tests"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        A/B Tests
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <FlaskConical className="w-6 h-6 text-amber-600" />
        <h1 className="text-2xl font-bold text-gray-900">Create A/B Test</h1>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <button
          onClick={() => { setMode("compare"); setVariantId(""); }}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            mode === "compare"
              ? "border-indigo-400 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <ArrowLeftRight className={`w-5 h-5 mt-0.5 shrink-0 ${mode === "compare" ? "text-indigo-600" : "text-gray-400"}`} />
          <div>
            <p className={`text-sm font-medium ${mode === "compare" ? "text-indigo-700" : "text-gray-700"}`}>
              Compare Two Pages
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Test two completely different pages against each other
            </p>
          </div>
        </button>
        <button
          onClick={() => { setMode("variation"); setVariantId(""); }}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            mode === "variation"
              ? "border-indigo-400 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <Copy className={`w-5 h-5 mt-0.5 shrink-0 ${mode === "variation" ? "text-indigo-600" : "text-gray-400"}`} />
          <div>
            <p className={`text-sm font-medium ${mode === "variation" ? "text-indigo-700" : "text-gray-700"}`}>
              Test Variation
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Duplicate a page and tweak headline, hero image, or other elements
            </p>
          </div>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Test name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Test Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Advertorial vs Listicle - HappySleep"
            className="w-full bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Market
          </label>
          <div className="flex gap-2">
            {availableLanguages.map((l) => (
              <button
                key={l.value}
                onClick={() => setLanguage(l.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  language === l.value
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                <span role="img" aria-label={l.label}>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
          {langInfo?.domain && (
            <p className="text-xs text-gray-400 mt-1">
              Deploys to {langInfo.domain}
            </p>
          )}
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            URL Slug
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {langInfo?.domain}/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""));
              }}
              placeholder="test-slug"
              className="flex-1 bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Variant A */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Variant A (Control)
          </label>
          <select
            value={controlId}
            onChange={(e) => setControlId(e.target.value)}
            className="w-full bg-white border border-gray-200 text-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">Select a page...</option>
            {pages.map((p) => (
              <option key={p.translation_id} value={p.translation_id}>
                {p.page_name} ({p.page_type})
              </option>
            ))}
          </select>
        </div>

        {/* Variant B */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Variant B
          </label>
          {mode === "compare" ? (
            <select
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="w-full bg-white border border-gray-200 text-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a page...</option>
              {pages.map((p) => (
                <option key={p.translation_id} value={p.translation_id}>
                  {p.page_name} ({p.page_type})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <Copy className="w-4 h-4 shrink-0 text-amber-600" />
              Variant B will be a copy of Variant A. You&apos;ll edit it after creating the test.
            </div>
          )}
        </div>

        {/* Split */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Traffic Split
          </label>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 w-20 text-right">
              A: {split}%
            </span>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="text-xs text-gray-500 w-20">
              B: {100 - split}%
            </span>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What are you testing and why?"
            className="w-full bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim() || !slug.trim() || !controlId || (mode === "compare" && !variantId)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            {loading ? "Creating..." : mode === "variation" ? "Create & Edit Variant" : "Create Test"}
          </button>
          <Link
            href="/ab-tests"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
