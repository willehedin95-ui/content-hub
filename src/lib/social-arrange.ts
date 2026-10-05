import { DEFAULT_SLOTS, nextFreeSlots } from "@/lib/social-slots";
/**
 * "Fördela": William's own uploads keep their order exactly; posts made by
 * Claude (source = "claude") are slotted in between them to break up runs.
 * William set the order of his images by hand (2026-10-05) - an earlier
 * version re-shuffled everything by rules and would have wrecked it.
 *
 * Walk the slots in time order. At each slot take William's next post,
 * unless a Claude post fits better here: William's next post would be the
 * same kind as the one before it (a run), or it has been `gap` slots since
 * the last Claude post. Claude posts are spread evenly over the queue.
 * The set of times never changes - only which post gets which time.
 */
export interface Arrangeable { id: string; scheduled_at: string; kind: string; format: string; source: string }

const TEXT_KINDS = new Set(["knowledge", "humor", "question"]);
const isText = (p: Arrangeable) => TEXT_KINDS.has(p.kind) || p.format === "carousel";

export function arrange<T extends Arrangeable>(posts: T[], lastPosted: Arrangeable | null): { id: string; scheduled_at: string }[] {
  const byTime = [...posts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  // Slots must be unique: two posts sharing a time (set by hand) would both
  // keep it. Repair duplicates by moving to the next free default slot.
  const slots = uniqueSlots(byTime.map((p) => p.scheduled_at));
  const own = byTime.filter((p) => p.source !== "claude");
  const mine = byTime.filter((p) => p.source === "claude");
  const gap = mine.length ? Math.max(2, Math.floor(slots.length / mine.length)) : Infinity;
  const out: { id: string; scheduled_at: string }[] = [];
  let prev: Arrangeable | null = lastPosted;
  let sinceMine = 0;
  for (const slot of slots) {
    const nextOwn = own[0];
    const runAhead = !!(nextOwn && prev && nextOwn.kind === prev.kind);
    const wantMine = mine.length > 0 && (!nextOwn || (runAhead && sinceMine >= Math.min(2, gap - 1)) || sinceMine >= gap);
    let pick: Arrangeable;
    if (wantMine) {
      // The Claude post that differs most from the previous post.
      let best = 0;
      const score = (p: Arrangeable) => (prev && p.kind === prev.kind ? 2 : 0) + (prev && isText(p) === isText(prev) ? 1 : 0) + (prev && p.format === "carousel" && prev.format === "carousel" ? 4 : 0);
      for (let i = 1; i < mine.length; i++) if (score(mine[i]) < score(mine[best])) best = i;
      pick = mine.splice(best, 1)[0];
      sinceMine = 0;
    } else {
      pick = own.shift()!;
      sinceMine++;
    }
    out.push({ id: pick.id, scheduled_at: slot });
    prev = pick;
  }
  return out;
}

function uniqueSlots(times: string[]): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const t of times) {
    let d = new Date(t);
    if (seen.has(d.getTime())) {
      const [next] = nextFreeSlots(1, new Set(seen), DEFAULT_SLOTS, d);
      d = next;
    }
    seen.add(d.getTime());
    out.push(d.toISOString());
  }
  return out.sort();
}
