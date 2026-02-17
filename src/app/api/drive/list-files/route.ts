import { NextRequest, NextResponse } from "next/server";
import { listDriveFiles, extractFolderId } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const { folderUrl } = (await req.json()) as { folderUrl: string };

  if (!folderUrl) {
    return NextResponse.json({ error: "folderUrl is required" }, { status: 400 });
  }

  const folderId = extractFolderId(folderUrl);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  try {
    const files = await listDriveFiles(folderId);
    return NextResponse.json({ folderId, files });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list files" },
      { status: 500 }
    );
  }
}
