// Posting slots for organic social, in Swedish time. William's call 2026-10-01:
// 07:30 and 18:30 while posting twice a day; tune later from results.
export const DEFAULT_SLOTS = ["07:30", "18:30"];
const TZ = "Europe/Stockholm";

/** UTC instant for a wall-clock time in Stockholm (handles summer/winter time). */
export function stockholmToUtc(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asLocal = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

export function stockholmYmd(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Next free slot after `from` that is not in `taken` (ISO strings). */
export function nextFreeSlots(count: number, taken: Set<number>, slots = DEFAULT_SLOTS, from = new Date(Date.now() + 15 * 60_000)): Date[] {
  const out: Date[] = [];
  const day = new Date(from);
  for (let i = 0; i < 400 && out.length < count; i++) {
    const ymd = stockholmYmd(new Date(day.getTime() + i * 86_400_000));
    for (const s of slots) {
      const t = stockholmToUtc(ymd, s);
      if (t > from && !taken.has(t.getTime())) { out.push(t); taken.add(t.getTime()); if (out.length === count) break; }
    }
  }
  return out;
}
