import { NextRequest } from "next/server";
import { shortlistList, shortlistSave, shortlistNote, shortlistDelete } from "@/lib/brand-shortlist-api";

// Inloggad route (auth via middleware).
export async function GET() {
  return shortlistList();
}
export async function POST(req: NextRequest) {
  return shortlistSave(req);
}
export async function PATCH(req: NextRequest) {
  return shortlistNote(req);
}
export async function DELETE(req: NextRequest) {
  return shortlistDelete(req);
}
