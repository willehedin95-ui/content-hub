import { NextResponse } from "next/server";
import { authCheck } from "@/lib/gethookd";

export async function GET() {
  try {
    const data = await authCheck();
    return NextResponse.json({
      ok: true,
      workspace: data.workspace.name,
      scopes: data.scopes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
