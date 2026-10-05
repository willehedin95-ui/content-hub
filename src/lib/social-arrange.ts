/**
 * Re-order queued posts over their slots so the feed follows the mix rules
 * agreed with William (2026-10-01):
 * - never two carousels in a row,
 * - never the same kind twice in a row,
 * - alternate "text" posts (knowledge, humor, question) with photo posts
 *   (product, person, other), so no grid row is all text.
 * The slots themselves (times) stay as they are - only which post goes in
 * which slot changes. Greedy: for each slot, pick the first remaining post
 * (in current order) with the fewest rule breaks against the previous one.
 */
export interface Arrangeable { id: string; scheduled_at: string; kind: string; format: string }

const TEXT_KINDS = new Set(["knowledge", "humor", "question"]);
const isText = (p: Arrangeable) => TEXT_KINDS.has(p.kind) || p.format === "carousel";

function penalty(prev: Arrangeable | null, p: Arrangeable): number {
  if (!prev) return 0;
  let n = 0;
  if (prev.format === "carousel" && p.format === "carousel") n += 4;
  if (prev.kind === p.kind) n += 2;
  if (isText(prev) === isText(p)) n += 1;
  return n;
}

export function arrange<T extends Arrangeable>(posts: T[], lastPosted: Arrangeable | null): { id: string; scheduled_at: string }[] {
  const slots = posts.map((p) => p.scheduled_at).sort();
  const remaining = [...posts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const out: { id: string; scheduled_at: string }[] = [];
  let prev: Arrangeable | null = lastPosted;
  for (const slot of slots) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) if (penalty(prev, remaining[i]) < penalty(prev, remaining[best])) best = i;
    const [p] = remaining.splice(best, 1);
    out.push({ id: p.id, scheduled_at: slot });
    prev = p;
  }
  return out;
}
