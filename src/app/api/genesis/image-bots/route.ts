import { NextResponse } from "next/server";

// GET /api/genesis/image-bots — the live "Image Prompts" Genesis bots (id, name, description)
// for the concept-page format picker. Cached in-memory ~10 min.

interface Bot {
  id: string;
  name: string;
  description: string;
}

let cache: { at: number; bots: Bot[] } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 10 * 60_000) {
    return NextResponse.json({ bots: cache.bots });
  }
  const key = process.env.GENESIS_API_KEY;
  const base = (process.env.GENESIS_BASE_URL || "https://gas.copycoders.ai/api/v1").replace(/\/+$/, "");
  if (!key) return NextResponse.json({ bots: [], error: "GENESIS_API_KEY not set" }, { status: 200 });

  try {
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return NextResponse.json({ bots: [], error: `models ${res.status}` }, { status: 200 });
    const json = (await res.json()) as { data?: Array<{ id: string; _genesis?: { name?: string; description?: string; category?: string } }> };
    const bots: Bot[] = (json.data || [])
      .filter((r) => (r._genesis?.category || "").toLowerCase() === "image prompts")
      .map((r) => ({ id: r.id, name: r._genesis?.name || r.id, description: (r._genesis?.description || "").slice(0, 160) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cache = { at: Date.now(), bots };
    return NextResponse.json({ bots });
  } catch (e) {
    return NextResponse.json({ bots: [], error: (e as Error).message }, { status: 200 });
  }
}
