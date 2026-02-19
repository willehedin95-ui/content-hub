import { NextResponse } from "next/server";
import { listDriveFolders } from "@/lib/google-drive";

export async function GET() {
  const parentFolderId = process.env.DRIVE_CONCEPTS_FOLDER_ID;

  if (!parentFolderId) {
    return NextResponse.json(
      { error: "DRIVE_CONCEPTS_FOLDER_ID not configured" },
      { status: 500 }
    );
  }

  try {
    const folders = await listDriveFolders(parentFolderId);
    return NextResponse.json({ folders, parentFolderId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list folders" },
      { status: 500 }
    );
  }
}
