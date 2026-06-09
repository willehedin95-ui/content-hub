import { NextRequest, NextResponse } from "next/server";
import {
  getShortlist,
  saveShortlist,
  updateShortlistNote,
  removeShortlist,
  type Overall,
} from "@/lib/brand-check";

// Delade handlers för shortlist-API:t. Används av både den inloggade routen
// (/api/brand-shortlist) och den token-skyddade publika (/api/bcheck-shortlist).

export async function shortlistList() {
  return NextResponse.json({ items: await getShortlist() });
}

export async function shortlistSave(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    note?: unknown;
    overall?: unknown;
    snapshot?: unknown;
  };
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Namn saknas" }, { status: 400 });
  }
  await saveShortlist(
    body.name,
    typeof body.note === "string" ? body.note : "",
    (typeof body.overall === "string" ? body.overall : null) as Overall | null,
    body.snapshot ?? null
  );
  return NextResponse.json({ ok: true });
}

export async function shortlistNote(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; note?: unknown };
  if (typeof body.name !== "string" || typeof body.note !== "string") {
    return NextResponse.json({ error: "Namn/note saknas" }, { status: 400 });
  }
  await updateShortlistNote(body.name, body.note);
  return NextResponse.json({ ok: true });
}

export async function shortlistDelete(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "Namn saknas" }, { status: 400 });
  }
  await removeShortlist(body.name);
  return NextResponse.json({ ok: true });
}

export function tokenOk(req: NextRequest): boolean {
  const secret = process.env.BRAND_CHECK_TOKEN;
  const t = req.nextUrl.searchParams.get("token");
  return typeof secret === "string" && secret.length > 0 && t === secret;
}
