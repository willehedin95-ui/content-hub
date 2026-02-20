"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  LinkIcon,
  Upload,
  X,
  Check,
  CheckSquare,
  Square,
} from "lucide-react";
import { PRODUCTS, PAGE_TYPES, Product, PageType } from "@/types";
import type { TextBlock, ImageBlock } from "@/app/api/fetch-url/route";

type Step = "url" | "meta";

const TAG_STYLES: Record<string, string> = {
  h1: "bg-purple-50 text-purple-700 border-purple-200",
  h2: "bg-blue-50 text-blue-700 border-blue-200",
  h3: "bg-cyan-50 text-cyan-700 border-cyan-200",
  h4: "bg-teal-50 text-teal-700 border-teal-200",
  p: "bg-gray-100 text-gray-600 border-gray-200",
  li: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function ImportPageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  const [name, setName] = useState("");
  const [product, setProduct] = useState<Product>("happysleep");
  const [pageType, setPageType] = useState<PageType>("advertorial");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("url");
    setUrl("");
    setFetching(false);
    setFetchError("");
    setFetchedHtml("");
    setFetchedTitle("");
    setTextBlocks([]);
    setImages([]);
    setStats(null);
    setPreviewTab("text");
    setSelectedImages(new Set());
    setName("");
    setProduct("happysleep");
    setPageType("advertorial");
    setSaving(false);
    setSaveError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function parseHtmlContent(html: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const title = doc.querySelector("title")?.textContent?.trim() || "Untitled";

    const blocks: TextBlock[] = [];
    doc.querySelectorAll("h1, h2, h3, h4, p, li").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || "").trim();
      if (text.length > 10) {
        blocks.push({ tag, text: text.slice(0, 200) });
      }
    });

    const imgs: ImageBlock[] = [];
    doc.querySelectorAll("img").forEach((el) => {
      const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
      const alt = el.getAttribute("alt") || "";
      if (src && !src.startsWith("data:")) imgs.push({ src, alt });
    });

    const linkCount = doc.querySelectorAll("a[href]").length;

    return { title, textBlocks: blocks.slice(0, 100), images: imgs.slice(0, 30), linkCount };
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setFetching(true);
    setFetchError("");

    const reader = new FileReader();
    reader.onload = () => {
      const html = reader.result as string;
      const { title, textBlocks: blocks, images: imgs, linkCount } = parseHtmlContent(html);

      setFetchedHtml(html);
      setFetchedTitle(title);
      setTextBlocks(blocks);
      setImages(imgs);
      setStats({ textBlocks: blocks.length, images: imgs.length, links: linkCount });
      setName(title);
      setUrl(`upload://${file.name}`);
      setStep("meta");
      setFetching(false);
    };
    reader.onerror = () => {
      setFetchError("Failed to read file");
      setFetching(false);
    };
    reader.readAsText(file);
  }

  async function handleFetch() {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError("");

    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

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
      setStep("meta");
    } catch {
      setFetchError("Failed to fetch URL — check your connection and try again");
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    if (!name) return;
    setSaving(true);
    setSaveError("");

    // Auto-generate a default slug from name (each translation overrides this)
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);

    // Build images_to_translate from selected image indices
    const imagesToTranslate = images
      .filter((_, i) => selectedImages.has(i))
      .map((img) => ({ src: img.src, alt: img.alt }));

    try {
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
          images_to_translate: imagesToTranslate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || "Failed to save page");
        return;
      }

      handleClose();
      router.push(`/pages/${data.id}`);
    } catch {
      setSaveError("Failed to save — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  const isBusy = fetching || saving;

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isBusy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={isBusy ? undefined : handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 mb-8 bg-white border border-gray-200 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import New Page</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Fetch a page by URL or upload an HTML file
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-6">
            <StepBadge n={1} label="Import" active={step === "url"} done={step === "meta"} />
            <div className="flex-1 h-px bg-gray-200" />
            <StepBadge n={2} label="Page Details" active={step === "meta"} done={false} />
          </div>

          {step === "url" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Page URL
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                      placeholder="https://..."
                      className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={handleFetch}
                    disabled={fetching || !url.trim()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-3 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {fetching && <Loader2 className="w-4 h-4 animate-spin" />}
                    {fetching ? "Fetching…" : "Fetch Page"}
                  </button>
                </div>

                {fetchError && (
                  <div className="mt-3 flex items-start gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {fetchError}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={fetching}
                className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 border border-gray-300 border-dashed text-gray-500 hover:text-gray-700 text-sm font-medium px-5 py-4 rounded-xl transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload HTML File
              </button>
            </div>
          )}

          {step === "meta" && (
            <div className="space-y-5">
              {/* Success banner with stats */}
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-emerald-700 text-sm font-medium truncate">{fetchedTitle}</p>
                  <p className="text-emerald-500 text-xs mt-0.5 truncate">
                    {url.startsWith("upload://") ? `Uploaded: ${url.replace("upload://", "")}` : url}
                  </p>
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
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <TabBtn active={previewTab === "text"} onClick={() => setPreviewTab("text")}>
                    <FileText className="w-3.5 h-3.5" /> Text Blocks ({textBlocks.length})
                  </TabBtn>
                  <TabBtn active={previewTab === "images"} onClick={() => setPreviewTab("images")}>
                    <ImageIcon className="w-3.5 h-3.5" /> Images ({images.length})
                    {selectedImages.size > 0 && (
                      <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {selectedImages.size} to translate
                      </span>
                    )}
                  </TabBtn>
                </div>

                {previewTab === "text" && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-200">
                    {textBlocks.length === 0 && (
                      <p className="text-gray-400 text-sm px-4 py-8 text-center">No text blocks found</p>
                    )}
                    {textBlocks.map((block, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                        <span
                          className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                            TAG_STYLES[block.tag] || TAG_STYLES.p
                          }`}
                        >
                          {block.tag}
                        </span>
                        <p className="text-gray-700 text-sm leading-snug line-clamp-2">
                          {block.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {previewTab === "images" && (
                  <div className="max-h-48 overflow-y-auto p-4">
                    {images.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">No images found</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedImages.size === images.length) {
                                setSelectedImages(new Set());
                              } else {
                                setSelectedImages(new Set(images.map((_, i) => i)));
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
                          >
                            {selectedImages.size === images.length ? (
                              <CheckSquare className="w-3.5 h-3.5" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                            {selectedImages.size === images.length ? "Deselect all" : "Select all for translation"}
                          </button>
                          <span className="text-xs text-gray-400">
                            {selectedImages.size} selected
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {images.map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setSelectedImages((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                });
                              }}
                              className={`relative group aspect-video bg-white rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                selectedImages.has(i)
                                  ? "border-indigo-500 ring-2 ring-indigo-200"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.src}
                                alt={img.alt}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                              <div
                                className={`absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                  selectedImages.has(i)
                                    ? "bg-indigo-500 text-white"
                                    : "bg-white/80 border border-gray-300 text-transparent"
                                }`}
                              >
                                <Check className="w-3 h-3" />
                              </div>
                              {img.alt && (
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1 text-xs text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                  {img.alt}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Page details form */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">Page Details</h3>

                <div>
                  <label htmlFor="modal-page-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Page Name
                  </label>
                  <input
                    id="modal-page-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="modal-product" className="block text-sm font-medium text-gray-700 mb-1.5">Product</label>
                    <select
                      id="modal-product"
                      value={product}
                      onChange={(e) => setProduct(e.target.value as Product)}
                      className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    >
                      {PRODUCTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="modal-page-type" className="block text-sm font-medium text-gray-700 mb-1.5">Page Type</label>
                    <select
                      id="modal-page-type"
                      value={pageType}
                      onChange={(e) => setPageType(e.target.value as PageType)}
                      className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    >
                      {PAGE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>

              {saveError && (
                <div className="flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {saveError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("url")}
                  className="px-5 py-2.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving…" : "Save & Continue →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? "bg-emerald-500 text-white" : active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-400"
      }`}>
        {done ? "✓" : n}
      </div>
      <span className={`text-sm font-medium ${active ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
    </div>
  );
}

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 text-emerald-500 text-xs">
      {icon}{label}
    </span>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
        active ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
