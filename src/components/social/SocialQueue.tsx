"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Check, Undo2, Trash2, Loader2, AlertCircle, CalendarDays, Sparkles, Shuffle, LayoutGrid, List, GripVertical, Images } from "lucide-react";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { shrinkForUpload } from "@/lib/shrink-for-upload";
import { stockholmToUtc } from "@/lib/social-slots";
import AssetPicker from "@/components/social/AssetPicker";

interface Post {
  id: string;
  scheduled_at: string;
  format: "image" | "carousel";
  media_urls: string[];
  caption: string;
  status: "draft" | "approved" | "publishing" | "posted" | "failed";
  kind: SocialKind;
  source: string;
  label: string | null;
  ig_media_id: string | null;
  ig_error: string | null;
  fb_post_id: string | null;
  fb_error: string | null;
  original_urls: string[] | null;
}

const STATUS: Record<Post["status"], { label: string; cls: string }> = {
  draft: { label: "Utkast", cls: "bg-gray-100 text-gray-700" },
  approved: { label: "Godkänd", cls: "bg-emerald-50 text-emerald-700" },
  publishing: { label: "Publiceras", cls: "bg-amber-50 text-amber-700" },
  posted: { label: "Publicerad", cls: "bg-indigo-50 text-indigo-700" },
  failed: { label: "Misslyckades", cls: "bg-red-50 text-red-700" },
};

const TZ = "Europe/Stockholm";
const dayKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function SocialQueue() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [social, setSocial] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asCarousel, setAsCarousel] = useState(false);
  const [uploadKind, setUploadKind] = useState<SocialKind>("product");
  const [view, setView] = useState<"list" | "grid">("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/social/posts");
    const json = await res.json();
    if (!res.ok) { setError(json.error || "Kunde inte hämta kön"); return; }
    setPosts(json.posts); setSocial(json.social); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(id); setError(null);
    const res = await fetch("/api/social/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Kunde inte spara");
    else setPosts((cur) => cur.map((p) => (p.id === id ? json.post : p)));
    setBusy(null);
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!confirm("Ta bort inlägget?")) return;
    setBusy(id);
    const res = await fetch(`/api/social/posts?id=${id}`, { method: "DELETE" });
    if (res.ok) setPosts((cur) => cur.filter((p) => p.id !== id));
    else setError((await res.json()).error || "Kunde inte ta bort");
    setBusy(null);
  }, []);

  const upload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload"); setError(null);
    try {
      const urls: string[] = [];
      // One request per image: Vercel rejects bodies over 4.5 MB.
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", await shrinkForUpload(f));
        const r = await fetch("/api/upload-temp", { method: "POST", body: fd });
        if (!r.ok) throw new Error(`Uppladdningen misslyckades (${r.status})`);
        urls.push((await r.json()).url);
      }
      const res = await fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, carousel: asCarousel && urls.length > 1, kind: uploadKind }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kunde inte lägga i kön");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [asCarousel, uploadKind, load]);

  // Assets already live in our storage: their URLs go straight into the queue.
  const addFromAssets = useCallback(async (urls: string[]) => {
    const res = await fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, carousel: asCarousel && urls.length > 1, kind: uploadKind }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Kunde inte lägga i kön");
    await load();
  }, [asCarousel, uploadKind, load]);

  const writeCaption = useCallback(async (id: string, hint?: string) => {
    setBusy(id); setError(null);
    const res = await fetch("/api/social/caption", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, hint }) });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Kunde inte skriva bildtext");
    else setPosts((cur) => cur.map((p) => (p.id === id ? json.post : p)));
    setBusy(null);
  }, []);

  const reorder = useCallback(async (ids: string[]) => {
    setError(null);
    // Optimistic: hand the existing times out in the new order locally first.
    setPosts((cur) => {
      const times = cur.filter((p) => ids.includes(p.id)).map((p) => p.scheduled_at).sort();
      return cur.map((p) => (ids.includes(p.id) ? { ...p, scheduled_at: times[ids.indexOf(p.id)] } : p));
    });
    const res = await fetch("/api/social/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Kunde inte ändra ordningen"); await load(); }
  }, [load]);

  const crop = useCallback(async (id: string, index: number, box: CropBox) => {
    setBusy(id); setError(null);
    const res = await fetch("/api/social/crop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, index, ...box }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Kunde inte beskära");
    else setPosts((cur) => cur.map((p) => (p.id === id ? json.post : p)));
    setBusy(null);
  }, []);

  const captionAll = useCallback(async () => {
    const n = posts.filter((p) => p.status === "draft" && !p.caption.trim()).length;
    if (!n || !confirm(`Skriva bildtext för ${n} utkast som saknar? Det tar ungefär ${Math.ceil(n * 12 / 60)} min.`)) return;
    setBusy("captions"); setError(null);
    const res = await fetch("/api/social/caption-all", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors?.length) setError(json.error || `${json.errors?.length} bildtexter misslyckades: ${json.errors?.[0] ?? ""}`);
    await load();
    setBusy(null);
  }, [posts, load]);

  const arrangeAll = useCallback(async () => {
    setBusy("arrange"); setError(null);
    const res = await fetch("/api/social/arrange", { method: "POST" });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Kunde inte fördela");
    await load();
    setBusy(null);
  }, [load]);

  const drafts = posts.filter((p) => p.status === "draft");
  const approveAll = useCallback(async () => {
    if (!confirm(`Godkänna alla ${drafts.length} utkast? De publiceras sedan automatiskt på sina tider.`)) return;
    for (const p of drafts) await patch(p.id, { status: "approved" });
  }, [drafts, patch]);


  if (!loading && !social) {
    return <div className="p-8 text-sm text-gray-600">Den här arbetsytan har ingen koppling till Instagram eller Facebook.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><CalendarDays className="w-5 h-5" />Sociala inlägg</h1>
          <p className="text-sm text-gray-500 mt-1">
            Publiceras på Instagram (@{String(social?.ig_username ?? "")}) och Facebook ({String(social?.fb_page_name ?? "")}).
            Bara <span className="font-medium text-gray-700">godkända</span> inlägg går ut, vid sin tid.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView("list")} className={cn("px-3 py-2 text-sm flex items-center gap-1", view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-500")}><List className="w-4 h-4" />Lista</button>
            <button onClick={() => setView("grid")} className={cn("px-3 py-2 text-sm flex items-center gap-1", view === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-500")}><LayoutGrid className="w-4 h-4" />Rutnät</button>
          </div>
          {posts.some((p) => p.status === "draft" && !p.caption.trim()) && (
            <button onClick={captionAll} disabled={busy === "captions"} className="px-3 py-2 rounded-lg border border-indigo-200 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-1">
              {busy === "captions" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Skriv alla bildtexter ({posts.filter((p) => p.status === "draft" && !p.caption.trim()).length})
            </button>
          )}
          <button onClick={arrangeAll} disabled={busy === "arrange"} title="Lägger hela kön i ordning: grafik aldrig två i rad och utspridd i rutnätet, produktbilder jämnt mellan modellbilderna. Körs också automatiskt efter varje uppladdning." className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1">
            {busy === "arrange" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}Fördela
          </button>
        {drafts.length > 0 && (
          <button onClick={approveAll} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            Godkänn alla utkast ({drafts.length})
          </button>
        )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4" />{error}</div>
      )}

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addFromAssets}
        kind={uploadKind} setKind={setUploadKind} asCarousel={asCarousel} setAsCarousel={setAsCarousel} />

      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-800">Lägg till bilder</p>
          <p className="text-xs text-gray-500">Ladda upp från datorn eller välj direkt ur Assets. Kön ordnas och får bildtexter automatiskt. Varje bild blir ett eget inlägg, eller en karusell om du kryssar i rutan.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as SocialKind)} className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700" title="Typ av inlägg">
            {Object.entries(SOCIAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={asCarousel} onChange={(e) => setAsCarousel(e.target.checked)} />Som karusell</label>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={busy === "upload"} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
            {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Välj bilder
          </button>
          <button onClick={() => setPickerOpen(true)} className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-indigo-50 flex items-center gap-2">
            <Images className="w-4 h-4" />Välj från Assets
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Hämtar kön...</div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500">Kön är tom.</p>
      ) : view === "grid" ? (
        <FeedGrid posts={posts} onReorder={reorder} />
      ) : (
        <SortableList posts={posts} onReorder={reorder} render={(p, handle) => (
          <PostCard post={p} busy={busy === p.id} onPatch={patch} onRemove={remove} onCaption={writeCaption} onCrop={crop} handle={handle} />
        )} />
      )}
    </div>
  );
}

const SHORT_KIND: Record<string, string> = { product: "Produkt", person: "Person", knowledge: "Kunskap", humor: "Humor", question: "Fråga", other: "Annat" };

// Instagram-style 3-column grid, newest first. Drafts and approved posts are
// sortable with dnd-kit: the dragged image follows the pointer, the others
// slide aside live, and the new order shows instantly (saved in the background).
function FeedGrid({ posts, onReorder }: { posts: Post[]; onReorder: (idsEarliestFirst: string[]) => void }) {
  const movable = (p: Post) => p.status === "draft" || p.status === "approved";
  const sorted = useMemo(() => [...posts].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)), [posts]);
  // Local order (newest first) so the grid updates the moment you drop.
  const [order, setOrder] = useState<string[]>(sorted.map((p) => p.id));
  useEffect(() => setOrder(sorted.map((p) => p.id)), [sorted]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  // Slot labels stay with the POSITION: the post dropped into a cell takes that cell's time.
  const slotTimes = useMemo(() => sorted.map((p) => p.scheduled_at), [sorted]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const target = byId.get(String(over.id));
    if (!target || !movable(target)) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    // Posted posts never move: keep them at their index.
    const fixed = order.map((id, i) => (!movable(byId.get(id)!) ? [i, id] as const : null)).filter(Boolean) as (readonly [number, string])[];
    const free = next.filter((id) => movable(byId.get(id)!));
    const merged: string[] = [];
    for (let i = 0, f = 0; i < order.length; i++) {
      const fx = fixed.find(([idx]) => idx === i);
      merged.push(fx ? fx[1] : free[f++]);
    }
    setOrder(merged);
    onReorder([...merged].filter((id) => movable(byId.get(id)!)).reverse());
  };

  const active = activeId ? byId.get(activeId) : null;
  return (
    <div className="max-w-md mx-auto">
      <p className="text-xs text-gray-500 mb-2 text-center">Dra ett inlägg till en annan ruta. Tiden står kvar på rutan, inlägget tar den tid som står där.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveId(String(e.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-0.5 bg-white">
            {order.map((id, i) => {
              const p = byId.get(id);
              return p ? <GridCell key={id} post={p} slot={slotTimes[i]} disabled={!movable(p)} /> : null;
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180 }}>
          {active ? (
            <div className="aspect-[3/4] w-full shadow-2xl ring-2 ring-indigo-500 rotate-2 scale-105 overflow-hidden rounded-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.media_urls[0]} alt="" className="w-full h-full object-cover" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function GridCell({ post: p, slot, disabled }: { post: Post; slot: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("relative aspect-[3/4] bg-gray-100 select-none touch-none", disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.media_urls[0]} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
      <span className={cn("absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium", STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
      {p.format === "carousel" && <span className="absolute top-1 right-1 text-white text-xs drop-shadow">▣</span>}
      <div className="absolute inset-x-0 bottom-0 px-1.5 pt-6 pb-1 bg-gradient-to-t from-black/70 to-transparent flex justify-between items-end text-[10px] leading-tight text-white">
        <span className="font-medium">{SHORT_KIND[p.kind] ?? p.kind}</span>
        <span className="text-right">{dayLabel(slot).split(" ").slice(1).join(" ")}<br />{timeLabel(slot)}</span>
      </div>
    </div>
  );
}

function PostCard({ post, busy, onPatch, onRemove, onCaption, onCrop, handle }: { post: Post; busy: boolean; onPatch: (id: string, b: Record<string, unknown>) => void; onRemove: (id: string) => void; onCaption: (id: string, hint?: string) => void; onCrop: (id: string, index: number, box: CropBox) => Promise<void>; handle?: React.ReactNode }) {
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [caption, setCaption] = useState(post.caption);
  useEffect(() => setCaption(post.caption), [post.caption]);
  const locked = post.status === "publishing" || post.status === "posted";
  const st = STATUS[post.status];
  const day = dayKey(post.scheduled_at);
  const time = timeLabel(post.scheduled_at);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4">
      {handle}
      <div className="flex gap-1.5 shrink-0 overflow-x-auto max-w-[45%]">
        {post.media_urls.map((u, i) => (
          <button key={i} type="button" disabled={locked} onClick={() => setCropIndex(i)} title={locked ? undefined : "Beskär"} className="relative group shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="w-24 h-[120px] object-cover rounded-md border border-gray-100" />
            {!locked && <span className="absolute inset-x-0 bottom-0 text-[10px] text-white bg-black/50 rounded-b-md py-0.5 opacity-0 group-hover:opacity-100">Beskär</span>}
          </button>
        ))}
        {cropIndex !== null && (
          <CropModal
            src={(post.original_urls ?? post.media_urls)[cropIndex] ?? post.media_urls[cropIndex]}
            onClose={() => setCropIndex(null)}
            onSave={async (box) => { await onCrop(post.id, cropIndex, box); setCropIndex(null); }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", st.cls)}>{st.label}</span>
          <select value={post.kind} disabled={locked} onChange={(e) => onPatch(post.id, { kind: e.target.value })} className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 bg-white disabled:bg-gray-50">
            {Object.entries(SOCIAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="text-xs text-gray-500">{post.format === "carousel" ? `Karusell, ${post.media_urls.length} bilder` : "Bild"}</span>
          <input
            key={post.scheduled_at}
            type="datetime-local"
            disabled={locked}
            defaultValue={`${day}T${time}`}
            onBlur={(e) => {
              const [d, t] = e.target.value.split("T");
              if (d && t && `${d}T${t}` !== `${day}T${time}`) onPatch(post.id, { scheduled_at: stockholmToUtc(d, t).toISOString() });
            }}
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 disabled:bg-gray-50"
          />
        </div>
        <textarea
          value={caption}
          disabled={locked}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== post.caption && onPatch(post.id, { caption })}
          placeholder="Bildtext"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 disabled:bg-gray-50"
        />
        {(post.ig_error || post.fb_error) && (
          <p className="text-xs text-red-600">{post.ig_error && `Instagram: ${post.ig_error}. `}{post.fb_error && `Facebook: ${post.fb_error}.`}</p>
        )}
        {post.status === "posted" && (
          <p className="text-xs text-gray-500">{post.ig_media_id ? "Instagram ✓ " : "Instagram ✗ "}{post.fb_post_id ? "· Facebook ✓" : "· Facebook ✗"}</p>
        )}
        {!locked && (
          <div className="flex gap-2">
            {post.status === "approved" ? (
              <button onClick={() => onPatch(post.id, { status: "draft" })} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" />Ångra godkännande</button>
            ) : (
              <button onClick={() => onPatch(post.id, { status: "approved" })} disabled={busy || !caption.trim()} title={!caption.trim() ? "Skriv en bildtext först" : undefined} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><Check className="w-3.5 h-3.5" />{post.status === "failed" ? "Försök igen" : "Godkänn"}</button>
            )}
            <button onClick={() => { const hint = caption.trim() ? prompt("Önskemål till den nya bildtexten? (lämna tomt för ett nytt förslag)") ?? undefined : undefined; onCaption(post.id, hint || undefined); }} disabled={busy} className="px-3 py-1.5 rounded-lg border border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{caption.trim() ? "Ny bildtext" : "Skriv bildtext"}</button>
            <button onClick={() => onRemove(post.id)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-red-600 hover:border-red-200 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Ta bort</button>
            {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center" />}
          </div>
        )}
      </div>
    </div>
  );
}

// List view, earliest first. Same reorder as the grid: drag a card by its
// handle, the times stay with the positions. Posted posts cannot move.
function SortableList({ posts, onReorder, render }: { posts: Post[]; onReorder: (idsEarliestFirst: string[]) => void; render: (p: Post, handle: React.ReactNode) => React.ReactNode }) {
  const movable = (p: Post) => p.status === "draft" || p.status === "approved";
  const sorted = useMemo(() => [...posts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), [posts]);
  const [order, setOrder] = useState<string[]>(sorted.map((p) => p.id));
  useEffect(() => setOrder(sorted.map((p) => p.id)), [sorted]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const slotTimes = useMemo(() => sorted.map((p) => p.scheduled_at), [sorted]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id || !movable(byId.get(String(over.id))!)) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    const free = next.filter((id) => movable(byId.get(id)!));
    let f = 0;
    const merged = order.map((id) => (movable(byId.get(id)!) ? free[f++] : id));
    setOrder(merged);
    onReorder(merged.filter((id) => movable(byId.get(id)!)));
  };
  const active = activeId ? byId.get(activeId) : null;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveId(String(e.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {order.map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            const showDay = i === 0 || dayKey(slotTimes[i]) !== dayKey(slotTimes[i - 1]);
            return (
              <div key={id}>
                {showDay && <h2 className="text-sm font-semibold text-gray-700 capitalize mb-2 mt-4">{dayLabel(slotTimes[i])}</h2>}
                <ListRow post={{ ...p, scheduled_at: slotTimes[i] }} disabled={!movable(p)} render={render} />
              </div>
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180 }}>
        {active ? (
          <div className="bg-white rounded-lg border-2 border-indigo-500 shadow-2xl p-3 flex gap-3 items-center w-[360px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.media_urls[0]} alt="" className="w-16 h-20 object-cover rounded" />
            <span className="text-sm text-gray-700 line-clamp-3">{active.caption || "Ingen bildtext än"}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ListRow({ post, disabled, render }: { post: Post; disabled: boolean; render: (p: Post, handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id, disabled });
  const handle = (
    <button {...attributes} {...listeners} disabled={disabled} title={disabled ? "Publicerad" : "Dra för att flytta"}
      className={cn("shrink-0 self-center p-1 rounded text-gray-400 touch-none", disabled ? "opacity-30 cursor-default" : "cursor-grab active:cursor-grabbing hover:bg-gray-100 hover:text-gray-600")}>
      <GripVertical className="w-5 h-5" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-30")}>
      {render(post, handle)}
    </div>
  );
}

type CropBox = { x: number; y: number; w: number; h: number };

// 4:5 crop frame over the original. Drag the frame; the slider zooms in.
function CropModal({ src, onClose, onSave }: { src: string; onClose: () => void; onSave: (box: CropBox) => Promise<void> }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 }); // frame centre, 0-1
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const R = 4 / 5;
  // Frame size as fractions of the image, the largest 4:5 that fits, times 1/zoom.
  const frame = useMemo(() => {
    if (!nat) return { w: 1, h: 1 };
    const imgR = nat.w / nat.h;
    const base = imgR > R ? { w: (nat.h * R) / nat.w, h: 1 } : { w: 1, h: nat.w / R / nat.h };
    return { w: base.w / zoom, h: base.h / zoom };
  }, [nat, zoom]);
  const clampPos = useCallback((p: { x: number; y: number }) => ({
    x: Math.min(1 - frame.w / 2, Math.max(frame.w / 2, p.x)),
    y: Math.min(1 - frame.h / 2, Math.max(frame.h / 2, p.y)),
  }), [frame]);
  useEffect(() => setPos((p) => clampPos(p)), [clampPos]);
  const box: CropBox = { x: pos.x - frame.w / 2, y: pos.y - frame.h / 2, w: frame.w, h: frame.h };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-gray-900">Beskär till 4:5 <span className="text-gray-500 font-normal">· dra rutan, zooma med reglaget</span></p>
        <div
          ref={boxRef}
          className="relative mx-auto select-none touch-none"
          style={{ width: nat ? Math.min(440, (typeof window !== "undefined" ? window.innerHeight * 0.62 : 560) * (nat.w / nat.h)) : 440 }}
          onPointerMove={(e) => {
            if (!drag.current || !boxRef.current) return;
            const r = boxRef.current.getBoundingClientRect();
            setPos(clampPos({ x: drag.current.px + (e.clientX - drag.current.x) / r.width, y: drag.current.py + (e.clientY - drag.current.y) / r.height }));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerLeave={() => { drag.current = null; }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full block rounded" draggable={false} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          {nat && (
            <div
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
              className="absolute border-2 border-white cursor-move"
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,.55)" }}
            />
          )}
        </div>
        <label className="flex items-center gap-3 text-xs text-gray-600">Zoom
          <input type="range" min={1} max={2.5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700">Avbryt</button>
          <button disabled={!nat || saving} onClick={async () => { setSaving(true); await onSave(box); setSaving(false); }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-60 flex items-center gap-1">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Spara beskärning
          </button>
        </div>
      </div>
    </div>
  );
}
