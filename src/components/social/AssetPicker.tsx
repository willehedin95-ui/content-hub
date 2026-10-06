"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Check, Search } from "lucide-react";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
import type { Asset, AssetCategory } from "@/types";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  product: "Produkt", model: "Modell", lifestyle: "Livsstil", graphic: "Grafik", logo: "Logga",
  before_after: "Före/efter", post_production: "Efterbehandlad", other: "Övrigt",
};

/**
 * Pick images straight from the asset bank into the social queue - no
 * download and re-upload. Assets already live in our own storage, so their
 * URLs go to POST /api/social/posts as they are. Selection order = carousel order.
 */
export default function AssetPicker({ open, onClose, onAdd, kind, setKind, asCarousel, setAsCarousel }: {
  open: boolean;
  onClose: () => void;
  onAdd: (urls: string[]) => Promise<void>;
  kind: SocialKind;
  setKind: (k: SocialKind) => void;
  asCarousel: boolean;
  setAsCarousel: (v: boolean) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked([]); setError(null);
    fetch("/api/assets?media_type=image").then(async (r) => {
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Kunde inte hämta assets");
      setAssets(json);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);

  const categories = useMemo(() => {
    const seen = new Set((assets ?? []).map((a) => a.category));
    return (Object.keys(CATEGORY_LABEL) as AssetCategory[]).filter((c) => seen.has(c));
  }, [assets]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets ?? []).filter((a) => (category === "all" || a.category === category)
      && (!q || a.name.toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.toLowerCase().includes(q))));
  }, [assets, category, search]);

  const toggle = (a: Asset) => {
    setPicked((cur) => {
      const next = cur.includes(a.id) ? cur.filter((id) => id !== a.id) : [...cur, a.id];
      // Guess the type from what is picked; it can still be changed below.
      const cats = new Set(next.map((id) => assets?.find((x) => x.id === id)?.category));
      if (cats.size === 1 && cats.has("model")) setKind("person");
      else if (cats.size === 1 && cats.has("product")) setKind("product");
      return next;
    });
  };

  const add = async () => {
    const urls = picked.map((id) => assets!.find((a) => a.id === id)!.url);
    setSaving(true); setError(null);
    try { await onAdd(urls); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const tooMany = asCarousel && picked.length > 10;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-800">Välj från Assets</p>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          {(["all", ...categories] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border", category === c ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
              {c === "all" ? "Alla" : CATEGORY_LABEL[c]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök" className="text-sm outline-none w-40" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {!assets && !error ? (
            <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Hämtar assets...</div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-500">Inga bilder här.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {shown.map((a) => {
                const n = picked.indexOf(a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a)} title={a.name}
                    className={cn("relative aspect-[4/5] rounded-lg overflow-hidden border-2 bg-gray-50", n >= 0 ? "border-indigo-600" : "border-transparent hover:border-gray-300")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.alt_text ?? a.name} loading="lazy" className="w-full h-full object-cover" />
                    {n >= 0 && (
                      <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
                        {asCarousel ? n + 1 : <Check className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center gap-3 flex-wrap">
          <select value={kind} onChange={(e) => setKind(e.target.value as SocialKind)} className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700" title="Typ av inlägg">
            {Object.entries(SOCIAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={asCarousel} onChange={(e) => setAsCarousel(e.target.checked)} />Som karusell</label>
          {tooMany && <span className="text-xs text-red-600">Max 10 bilder i en karusell</span>}
          <button onClick={add} disabled={!picked.length || saving || tooMany}
            className="ml-auto px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {picked.length ? `Lägg i kön (${picked.length})` : "Lägg i kön"}
          </button>
        </div>
      </div>
    </div>
  );
}
