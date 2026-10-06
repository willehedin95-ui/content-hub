import { DEFAULT_SLOTS, nextFreeSlots } from "@/lib/social-slots";
/**
 * "Fördela": Claude owns the order of the whole queue (William 2026-10-06:
 * his only job is to upload product and model photos; the order is Claude's).
 * The set of times never changes - only which post gets which time.
 *
 * Three groups:
 *   G = graphics, everything Claude made (carousels, text posts, comparisons)
 *   P = William's photos with a person (kind "person")
 *   R = William's other photos (product shots)
 * Rules:
 *   - Never two G in a row, and never all in one column of the 3-wide profile
 *     grid (that happens at exactly every third post): gaps 5, 2, 2 at a third
 *     of the feed walk diagonally through the columns and alternate between
 *     morning and evening.
 *   - Carousels alternate with single graphics.
 *   - R spread evenly among the photos, never two R in a row.
 *   - Within each group the existing order is kept (William's upload order).
 * Posts that are not movable (published, or approved and due soon) stay put;
 * the pattern continues around them.
 */
export interface Arrangeable { id: string; scheduled_at: string; kind: string; format: string; source: string }
type Group = "G" | "P" | "R";
export const groupOf = (p: Arrangeable): Group => (p.source === "claude" ? "G" : p.kind === "person" ? "P" : "R");

/**
 * @param movable posts that may get a new time
 * @param fixed   future posts that keep their time (they take part in the pattern)
 * @param before  latest published posts, newest last (where the pattern continues from)
 */
export function arrange<T extends Arrangeable>(movable: T[], fixed: Arrangeable[] = [], before: Arrangeable[] = []): { id: string; scheduled_at: string }[] {
  if (!movable.length) return [];
  const slots = uniqueSlots(movable.map((p) => p.scheduled_at), fixed.map((p) => p.scheduled_at));
  const byTime = [...movable].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const P = byTime.filter((p) => groupOf(p) === "P");
  const R = byTime.filter((p) => groupOf(p) === "R");
  const G = alternateCarousels(byTime.filter((p) => groupOf(p) === "G"), [...before, ...fixed].filter((p) => groupOf(p) === "G").pop());

  // Timeline: open slots (null) and fixed posts, in time order.
  const timeline: { at: string; post: Arrangeable | null }[] = [
    ...slots.map((at) => ({ at, post: null })),
    ...fixed.map((p) => ({ at: p.scheduled_at, post: p })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const nG = G.length, nPhotos = P.length + R.length;
  const base = nG ? (slots.length + fixed.length) / (nG + fixed.filter((p) => groupOf(p) === "G").length) : Infinity;
  // A gap that is a multiple of 3 keeps G in the same grid column, so such a
  // base is split (3 -> 5,2,2). The odd gap also moves G between morning and
  // evening - with two posts a day an even gap always lands on the same time.
  const r = Math.max(2, Math.round(base));
  const gaps = r % 3 === 0 ? [r + 2, r - 1, r - 1] : [r];
  const rEvery = R.length ? Math.max(2, Math.round(nPhotos / R.length)) : Infinity;

  // Pattern state from what was published before.
  let sinceG = 99, sincePhotoR = 99, prev: Group | null = null, gapIdx = 0;
  for (const p of before) step(groupOf(p));
  function step(g: Group) {
    sinceG = g === "G" ? 0 : sinceG + 1;
    if (g === "R") sincePhotoR = 0; else if (g === "P") sincePhotoR++;
    prev = g;
  }

  const out: { id: string; scheduled_at: string }[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    if (t.post) { if (groupOf(t.post) === "G") gapIdx++; step(groupOf(t.post)); continue; }
    const openLeft = timeline.slice(i).filter((x) => !x.post).length;
    const photosLeft = P.length + R.length;
    const target = gaps[gapIdx % gaps.length];
    // G is due when the gap is reached, or when the rest of the G only just fit with gap 2.
    const mustG = G.length > 0 && openLeft <= (G.length - 1) * 2 + 1;
    const wantG = G.length > 0 && prev !== "G" && (sinceG + 1 >= target || mustG || photosLeft === 0);
    let pick: Arrangeable;
    if (wantG || photosLeft === 0) {
      pick = G.shift()!; gapIdx++;
    } else {
      const photoSlotsLeft = openLeft - G.length;
      const mustR = R.length > 0 && photoSlotsLeft <= (R.length - 1) * 2 + 1;
      const wantR = R.length > 0 && prev !== "R" && (sincePhotoR + 1 >= rEvery || mustR || P.length === 0);
      pick = (wantR ? R.shift() : P.shift()) ?? (R.shift() ?? G.shift())!;
    }
    out.push({ id: pick.id, scheduled_at: t.at });
    step(groupOf(pick));
  }
  return out;
}

/** Carousels and single graphics take turns; each kind keeps its own order. */
function alternateCarousels<T extends Arrangeable>(posts: T[], last: Arrangeable | undefined): T[] {
  const car = posts.filter((p) => p.format === "carousel");
  const one = posts.filter((p) => p.format !== "carousel");
  const out: T[] = [];
  let wantCar = !(last && last.format === "carousel");
  while (car.length || one.length) {
    const from = (wantCar && car.length) || !one.length ? car : one;
    out.push(from.shift()!);
    wantCar = from === one;
  }
  return out;
}

function uniqueSlots(times: string[], taken: string[]): string[] {
  const seen = new Set<number>(taken.map((t) => new Date(t).getTime()));
  const out: string[] = [];
  for (const t of [...times].sort()) {
    let d = new Date(t);
    // Two posts sharing a time (set by hand) would both keep it - move to the next free default slot.
    if (seen.has(d.getTime())) [d] = nextFreeSlots(1, new Set(seen), DEFAULT_SLOTS, d);
    seen.add(d.getTime());
    out.push(d.toISOString());
  }
  return out.sort();
}
