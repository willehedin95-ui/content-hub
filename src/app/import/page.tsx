"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  LinkIcon,
} from "lucide-react";
import { PRODUCTS, PAGE_TYPES, Product, PageType } from "@/types";
import type { TextBlock, ImageBlock } from "@/app/api/fetch-url/route";

type Step = "url" | "meta";

const TAG_STYLES: Record<string, string> = {
  h1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  h2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  h3: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  h4: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  p: "bg-slate-700/50 text-slate-400 border-slate-600/30",
  li: "bg-slate-700/50 text-slate-500 border-slate-600/30",
};

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");

  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchedHtml, setFetchedHtml] = useState("");
  const [fetchedTitle, setFetchedTitle] = useState("");
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [images, setImages] = useState<ImageBlock[]>([]);
  const [stats, setStats] = useState<{ textBlocks: number; images: number; links: number } | null>(null);
  const [previewTab, setPreviewTab] = useState<"text" | "images">("text");

  const [name, setName] = useState("");
  const [product, setProduct] = useState<Product>("happysleep");
  const [pageType, setPageType] = useState<PageType>("advertorial");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleFetch() {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError("");

    const res = await fetch("/api/fetch-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });

    const data = await res.json();
    setFetching(false);

    if (!res.ok) {
      setFetchError(data.error || "Failed to fetch URL");
      return;
    }

    setFetchedHtml(data.html);
    setFetchedTitle(data.title);
    setTextBlocks(data.textBlocks || []);
    setImages(data.images || []);
    setStats(data.stats || null);
    setName(data.title);
    setSlug(
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 80)
    );
    setStep("meta");
  }

  async function handleSave() {
    if (!name || !slug) return;
    setSaving(true);
    setSaveError("");

    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        product,
        page_type: pageType,
        source_url: url,
        original_html: fetchedHtml,
        slug,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setSaveError(data.error || "Failed to save page");
      return;
    }

    router.push(`/pages/${data.id}`);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Import New Page</h1>
        <p className="text-slate-400 text-sm mt-1">
          Paste the URL of Ron&apos;s Lovable page to import it
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        <StepBadge n={1} label="Fetch URL" active={step === "url"} done={step === "meta"} />
        <div className="flex-1 h-px bg-[#1e2130]" />
        <StepBadge n={2} label="Page Details" active={step === "meta"} done={false} />
      </div>

      {step === "url" && (
        <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Page URL
          </label>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                placeholder="https://lovable.app/projects/..."
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 placeholder-slate-600 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleFetch}
              disabled={fetching || !url.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-3 rounded-lg transition-colors whitespace-nowrap"
            >
              {fetching && <Loader2 className="w-4 h-4 animate-spin" />}
              {fetching ? "Fetching…" : "Fetch Page"}
            </button>
          </div>

          {fetchError && (
            <div className="mt-3 flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {fetchError}
            </div>
          )}
        </div>
      )}

      {step === "meta" && (
        <div className="space-y-5">
          {/* Success banner with stats */}
          <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-emerald-300 text-sm font-medium truncate">{fetchedTitle}</p>
              <p className="text-emerald-400/60 text-xs mt-0.5 truncate">{url}</p>
              {stats && (
                <div className="flex gap-4 mt-2">
                  <StatChip icon={<FileText className="w-3 h-3" />} label={`${stats.textBlocks} text blocks`} />
                  <StatChip icon={<ImageIcon className="w-3 h-3" />} label={`${stats.images} images`} />
                  <StatChip icon={<LinkIcon className="w-3 h-3" />} label={`${stats.links} links`} />
                </div>
              )}
            </div>
          </div>

          {/* Content preview */}
          <div className="bg-[#141620] border border-[#1e2130] rounded-xl overflow-hidden">
            <div className="flex border-b border-[#1e2130]">
              <TabBtn active={previewTab === "text"} onClick={() => setPreviewTab("text")}>
                <FileText className="w-3.5 h-3.5" /> Text Blocks ({textBlocks.length})
              </TabBtn>
              <TabBtn active={previewTab === "images"} onClick={() => setPreviewTab("images")}>
                <ImageIcon className="w-3.5 h-3.5" /> Images ({images.length})
              </TabBtn>
            </div>

            {previewTab === "text" && (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#1e2130]">
                {textBlocks.length === 0 && (
                  <p className="text-slate-500 text-sm px-4 py-8 text-center">No text blocks found</p>
                )}
                {textBlocks.map((block, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                        TAG_STYLES[block.tag] || TAG_STYLES.p
                      }`}
                    >
                      {block.tag}
                    </span>
                    <p className="text-slate-300 text-sm leading-snug line-clamp-2">
                      {block.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {previewTab === "images" && (
              <div className="max-h-72 overflow-y-auto p-4 grid grid-cols-3 gap-3">
                {images.length === 0 && (
                  <p className="col-span-3 text-slate-500 text-sm text-center py-8">No images found</p>
                )}
                {images.map((img, i) => (
                  <div key={i} className="relative group aspect-video bg-[#0a0c14] rounded-lg overflow-hidden border border-[#1e2130]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt={img.alt}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {img.alt && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1 text-[10px] text-slate-300 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {img.alt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Page details form */}
          <div className="bg-[#141620] border border-[#1e2130] rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-300">Page Details</h3>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Page Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Product</label>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value as Product)}
                  className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {PRODUCTS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Page Type</label>
                <select
                  value={pageType}
                  onChange={(e) => setPageType(e.target.value as PageType)}
                  className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {PAGE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Slug <span className="text-slate-500 font-normal">(URL path)</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))
                }
                className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
              <p className="text-slate-500 text-xs mt-1.5">
                blog.halsobladet.com/<span className="text-slate-400">{slug || "your-slug"}</span>
              </p>
            </div>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {saveError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("url")}
              className="px-5 py-2.5 text-sm text-slate-400 hover:text-slate-200 border border-[#1e2130] rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name || !slug}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? "bg-emerald-500 text-white" : active ? "bg-indigo-600 text-white" : "bg-[#1e2130] text-slate-500"
      }`}>
        {done ? "✓" : n}
      </div>
      <span className={`text-sm font-medium ${active ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
    </div>
  );
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 text-emerald-400/70 text-xs">
      {icon}{label}
    </span>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
        active ? "text-indigo-300 border-b-2 border-indigo-500 bg-indigo-500/5" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
