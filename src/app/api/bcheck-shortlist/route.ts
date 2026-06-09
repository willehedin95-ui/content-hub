import { NextRequest, NextResponse } from "next/server";
import { shortlistList, shortlistSave, shortlistNote, shortlistDelete, tokenOk } from "@/lib/brand-shortlist-api";

// Publik route (vitlistad i middleware) - token i ?token=... query.
function guard(req: NextRequest) {
  return tokenOk(req) ? null : NextResponse.json({ error: "Ej behörig" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  return guard(req) ?? shortlistList();
}
export async function POST(req: NextRequest) {
  return guard(req) ?? shortlistSave(req);
}
export async function PATCH(req: NextRequest) {
  return guard(req) ?? shortlistNote(req);
}
export async function DELETE(req: NextRequest) {
  return guard(req) ?? shortlistDelete(req);
}
