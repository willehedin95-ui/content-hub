import { google } from "googleapis";

function getAuth() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google Drive service account not configured");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType, thumbnailLink)",
    orderBy: "name",
    pageSize: 100,
  });

  return (res.data.files ?? []) as DriveFile[];
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data as ArrayBuffer);
}

export async function createDriveFolder(
  parentFolderId: string,
  name: string
): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  // Check if folder already exists
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
  });

  if (existing.data.files?.length) {
    return existing.data.files[0].id!;
  }

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  return res.data.id!;
}

export async function uploadToDrive(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const { Readable } = await import("stream");

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  return res.data.id!;
}

export async function getFolderName(folderId: string): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get({ fileId: folderId, fields: "name" });
  return res.data.name ?? "Untitled";
}

export function extractFolderId(url: string): string | null {
  // https://drive.google.com/drive/folders/FOLDER_ID
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
