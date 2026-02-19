import { google } from "googleapis";

// Service account auth — used for reading (list, download, folder metadata)
function getAuth() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google Drive service account not configured");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

// User OAuth auth — used for writing (upload, create folders)
// Service accounts have no storage quota and cannot upload files.
function getUploadAuth() {
  const clientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive OAuth not configured. Set GDRIVE_OAUTH_CLIENT_ID, GDRIVE_OAUTH_CLIENT_SECRET, and GDRIVE_OAUTH_REFRESH_TOKEN."
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export async function listDriveFolders(parentFolderId: string): Promise<DriveFolder[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 200,
  });

  return (res.data.files ?? []) as DriveFolder[];
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
  const auth = getUploadAuth();
  const drive = google.drive({ version: "v3", auth });

  // Check if folder already exists
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
  }, {
    headers: { "x-goog-user-project": "claude-code-william" },
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
  }, {
    headers: { "x-goog-user-project": "claude-code-william" },
  });

  return res.data.id!;
}

export async function uploadToDrive(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const auth = getUploadAuth();
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
  }, {
    headers: { "x-goog-user-project": "claude-code-william" },
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
