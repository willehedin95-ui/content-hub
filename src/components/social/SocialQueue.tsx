"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Check, Undo2, Trash2, Loader2, AlertCircle, CalendarDays, Sparkles, Shuffle, LayoutGrid, List } from "lucide-react";
import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { shrinkForUpload } from "@/lib/shrink-for-upload";
import { stockholmToUtc } from "@/lib/social-slots";

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

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) { const k = dayKey(p.scheduled_at); m.set(k, [...(m.get(k) ?? []), p]); }
    return Array.from(m.entries());
  }, [posts]);

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
          <button onClick={arrangeAll} disabled={busy === "arrange"} title="Sprider ut typerna: aldrig två karuseller i rad, aldrig samma typ i rad, text och foto omväxlande" className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1">
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

      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-800">Lägg till bilder</p>
          <p className="text-xs text-gray-500">Hamnar som utkast på nästa lediga tider. Varje bild blir ett eget inlägg, eller en karusell om du kryssar i rutan.</p>
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
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Hämtar kön...</div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500">Kön är tom.</p>
      ) : view === "grid" ? (
        <FeedGrid posts={posts} onReorder={reorder} />
      ) : (
        byDay.map(([day, list]) => (
          <section key={day} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 capitalize">{dayLabel(list[0].scheduled_at)}</h2>
            {list.map((p) => <PostCard key={p.id} post={p} busy={busy === p.id} onPatch={patch} onRemove={remove} onCaption={writeCaption} />)}
          </section>
        ))
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

function PostCard({ post, busy, onPatch, onRemove, onCaption }: { post: Post; busy: boolean; onPatch: (id: string, b: Record<string, unknown>) => void; onRemove: (id: string) => void; onCaption: (id: string, hint?: string) => void }) {
  const [caption, setCaption] = useState(post.caption);
  useEffect(() => setCaption(post.caption), [post.caption]);
  const locked = post.status === "publishing" || post.status === "posted";
  const st = STATUS[post.status];
  const day = dayKey(post.scheduled_at);
  const time = timeLabel(post.scheduled_at);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4">
      <div className="flex gap-1.5 shrink-0 overflow-x-auto max-w-[45%]">
        {post.media_urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={u} alt="" className="w-24 h-32 object-cover rounded-md border border-gray-100" />
        ))}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", st.cls)}>{st.label}</span>
          <select value={post.kind} disabled={locked} onChange={(e) => onPatch(post.id, { kind: e.target.value })} className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 bg-white disabled:bg-gray-50">
            {Object.entries(SOCIAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="text-xs text-gray-500">{post.format === "carousel" ? `Karusell, ${post.media_urls.length} bilder` : "Bild"}</span>
          <input
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
