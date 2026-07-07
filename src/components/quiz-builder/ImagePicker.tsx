"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Link as LinkIcon, X, Loader2 } from "lucide-react";
import { useQuiz } from "./QuizContext";

type ImagePickerProps = {
  /** Current image URL (or empty string). */
  value: string;
  /** Called with the new URL whenever the picker resolves a new image. */
  onChange: (url: string) => void;
  /** Optional dashed-placeholder hint shown when value is empty (e.g. Gemini description). */
  hint?: string;
  /** Compact mode for per-option pickers in image_cards layout. */
  compact?: boolean;
};

// `/api/products` already returns each product with its product_images joined
// as `product_images: { id, url, category }[]`. We flatten across products and
// search by category since there is no per-image alt field today.
type ProductImage = { id: string; url: string; category: string | null };

export function ImagePicker({ value, onChange, hint, compact }: ImagePickerProps) {
  const { quiz } = useQuiz();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showBank, setShowBank] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [bankImgs, setBankImgs] = useState<ProductImage[] | null>(null);
  const [bankQuery, setBankQuery] = useState("");

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/upload-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { url: string };
      onChange(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!showBank || bankImgs !== null) return;
    fetch(`/api/products`)
      .then((r) => (r.ok ? r.json() : []))
      .then((products: { product_images?: ProductImage[] }[]) => {
        const flat: ProductImage[] = (products ?? []).flatMap(
          (p) => p.product_images ?? [],
        );
        setBankImgs(flat);
      })
      .catch(() => setBankImgs([]));
  }, [showBank, bankImgs]);

  const filteredBank = bankImgs?.filter((img) =>
    bankQuery.trim()
      ? (img.category ?? "").toLowerCase().includes(bankQuery.trim().toLowerCase())
      : true,
  );

  /** Validate + apply a manually entered image URL. Requires https:// (a
   *  blob:/localhost URL bakes a dead reference into the published quiz)
   *  and warns when the host is not Supabase Storage (external hosts can
   *  remove the file and silently break the live funnel). */
  function handleSetUrl() {
    const url = urlInput.trim();
    if (!/^https:\/\//i.test(url)) {
      setErr("Image URL must start with https:// - blob:/http:/localhost URLs break on the published quiz.");
      return;
    }
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      setErr("Invalid URL");
      return;
    }
    setErr(null);
    setWarning(
      host.endsWith(".supabase.co")
        ? null
        : `Heads up: ${host} is not Supabase Storage. Prefer Upload so the image can't disappear from under the published quiz.`,
    );
    onChange(url);
    setUrlInput("");
    setShowUrl(false);
  }

  const previewBoxClass = compact
    ? "w-20 h-20 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden"
    : "w-full aspect-video rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden";

  return (
    <div className="flex flex-col gap-1.5">
      <div className={previewBoxClass}>
        {value ? (
          <Image src={value} alt="" width={400} height={300}
            className="w-full h-full object-cover" unoptimized />
        ) : (
          <div className="text-[11px] text-gray-400 px-2 text-center">
            {hint ? <em>{hint}</em> : "No image"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
        </button>
        <button type="button" onClick={() => setShowBank((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          <ImageIcon size={11} /> Product bank
        </button>
        <button type="button" onClick={() => setShowUrl((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          <LinkIcon size={11} /> URL
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-500 hover:text-red-600">
            <X size={11} /> Clear
          </button>
        )}
      </div>
      {showUrl && (
        <div className="flex gap-1 mt-1">
          <input className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
            placeholder="https://..." value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)} />
          <button type="button" disabled={!urlInput.trim()}
            onClick={handleSetUrl}
            className="px-2 py-1 rounded bg-indigo-600 text-white text-[11px] disabled:opacity-50">
            Set
          </button>
        </div>
      )}
      {showBank && (
        <div className="border border-gray-200 rounded-md p-2 bg-white max-h-48 overflow-y-auto">
          <input
            className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] mb-1"
            placeholder="Search by category..."
            value={bankQuery}
            onChange={(e) => setBankQuery(e.target.value)}
          />
          {bankImgs === null && <div className="text-[11px] text-gray-400">Loading...</div>}
          {bankImgs && filteredBank!.length === 0 && (
            <div className="text-[11px] text-gray-400">No images.</div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {filteredBank?.slice(0, 60).map((img) => (
              <button key={img.id} type="button"
                onClick={() => { onChange(img.url); setShowBank(false); }}
                className="aspect-square rounded overflow-hidden border border-gray-200 hover:border-indigo-400"
                title={img.category ?? ""}>
                <Image src={img.url} alt={img.category ?? ""} width={120} height={120}
                  className="w-full h-full object-cover" unoptimized />
              </button>
            ))}
          </div>
        </div>
      )}
      {err && <div className="text-[11px] text-red-600">{err}</div>}
      {warning && <div className="text-[11px] text-amber-600">{warning}</div>}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = "";
        }} />
    </div>
  );
}
