const fs = require("fs");
// Manual dotenv parsing
const envContent = fs.readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.substring(0, eqIdx);
  let val = trimmed.substring(eqIdx + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}
const { google } = require("googleapis");

const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const folderId = process.env.DRIVE_CONCEPTS_FOLDER_ID;

console.log("Email:", email);
console.log("Key exists:", Boolean(key), "length:", key?.length);
console.log("Folder ID:", folderId);

if (!email || !key || !folderId) {
  console.log("Missing env vars");
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

drive.files
  .list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 200,
  })
  .then((res) => {
    console.log("Success! Found", res.data.files?.length, "folders");
    console.log(JSON.stringify(res.data.files?.slice(0, 10), null, 2));
  })
  .catch((err) => {
    console.error("Error:", err.message);
    console.error("Code:", err.code);
    if (err.errors) console.error("Details:", JSON.stringify(err.errors));
  });
