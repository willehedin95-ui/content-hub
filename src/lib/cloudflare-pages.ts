import { createHash } from "crypto";
import { Language } from "@/types";
import { createServerSupabase } from "@/lib/supabase";
import { fetchWithRetry } from "./retry";

const CF_API = "https://api.cloudflare.com/client/v4";

interface CFDeployResult {
  url: string;
  deploy_id: string;
}

interface ABTestDeployResult {
  routerUrl: string;
  controlUrl: string;
  variantUrl: string;
  deploy_id: string;
}

export interface DeployFile {
  path: string;
  sha1: string;
  body: Uint8Array;
}

function md5hex(data: Buffer | string): string {
  return createHash("md5")
    .update(typeof data === "string" ? Buffer.from(data, "utf-8") : data)
    .digest("hex");
}

function getConfig() {
  const accountId = process.env.CF_PAGES_ACCOUNT_ID;
  const apiToken = process.env.CF_PAGES_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error("CF_PAGES_ACCOUNT_ID and CF_PAGES_API_TOKEN must be configured");
  }
  return { accountId, apiToken };
}

function getProjectName(language: Language): string {
  const key = `CF_PAGES_PROJECT_${language.toUpperCase()}`;
  const name = process.env[key];
  if (!name) throw new Error(`${key} not configured for language: ${language}`);
  return name;
}

async function getUploadToken(
  accountId: string,
  apiToken: string,
  projectName: string
): Promise<string> {
  const res = await fetchWithRetry(
    `${CF_API}/accounts/${accountId}/pages/projects/${projectName}/upload-token`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Failed to get upload token: ${await res.text()}`);
  }
  const json = (await res.json()) as { result: { jwt: string } };
  return json.result.jwt;
}

async function uploadFiles(
  jwt: string,
  files: Array<{ hash: string; content: Buffer; contentType: string }>
): Promise<void> {
  const MAX_BUCKET_BYTES = 40 * 1024 * 1024;
  const MAX_FILES_PER_BUCKET = 1000;

  const buckets: (typeof files)[] = [];
  let bucket: typeof files = [];
  let bucketSize = 0;

  for (const f of files) {
    if (
      bucket.length >= MAX_FILES_PER_BUCKET ||
      bucketSize + f.content.length > MAX_BUCKET_BYTES
    ) {
      if (bucket.length > 0) buckets.push(bucket);
      bucket = [];
      bucketSize = 0;
    }
    bucket.push(f);
    bucketSize += f.content.length;
  }
  if (bucket.length > 0) buckets.push(bucket);

  for (const b of buckets) {
    const payload = b.map((f) => ({
      key: f.hash,
      value: f.content.toString("base64"),
      metadata: { contentType: f.contentType },
      base64: true,
    }));

    const res = await fetchWithRetry(`${CF_API}/pages/assets/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
    });

    if (!res.ok) {
      throw new Error(`CF file upload failed: ${await res.text()}`);
    }
  }
}

async function upsertHashes(jwt: string, hashes: string[]): Promise<void> {
  if (hashes.length === 0) return;
  const res = await fetchWithRetry(`${CF_API}/pages/assets/upsert-hashes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hashes }),
  });
  if (!res.ok) {
    throw new Error(`CF upsert-hashes failed: ${await res.text()}`);
  }
}

async function createDeployment(
  accountId: string,
  apiToken: string,
  projectName: string,
  manifest: Record<string, string>
): Promise<{ id: string; url: string }> {
  const formData = new FormData();
  formData.append("manifest", JSON.stringify(manifest));

  const res = await fetchWithRetry(
    `${CF_API}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: formData,
      timeoutMs: 60_000,
    }
  );

  if (!res.ok) {
    throw new Error(`CF deployment failed: ${await res.text()}`);
  }

  const json = (await res.json()) as { result: { id: string; url: string } };
  return { id: json.result.id, url: json.result.url };
}

async function getProjectBaseUrl(
  accountId: string,
  apiToken: string,
  projectName: string
): Promise<string> {
  const res = await fetchWithRetry(
    `${CF_API}/accounts/${accountId}/pages/projects/${projectName}`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );
  if (!res.ok) return `https://${projectName}.pages.dev`;

  const json = (await res.json()) as {
    result: { domains: string[]; subdomain: string };
  };
  const customDomain = json.result.domains?.find(
    (d) => !d.endsWith(".pages.dev")
  );
  return customDomain
    ? `https://${customDomain}`
    : `https://${json.result.subdomain}`;
}

async function loadManifest(
  projectName: string
): Promise<Record<string, string>> {
  const db = createServerSupabase();
  const { data } = await db
    .from("cf_pages_manifests")
    .select("manifest")
    .eq("project_name", projectName)
    .single();
  return (data?.manifest as Record<string, string>) ?? {};
}

async function saveManifest(
  projectName: string,
  manifest: Record<string, string>
): Promise<void> {
  const db = createServerSupabase();
  await db.from("cf_pages_manifests").upsert({
    project_name: projectName,
    manifest,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Deploy a page (HTML + optional images) to Cloudflare Pages.
 * Merges with existing files so previously published pages are preserved.
 */
export async function publishPage(
  html: string,
  slug: string,
  language: Language,
  additionalFiles?: DeployFile[],
  onProgress?: (current: number, total: number) => void
): Promise<CFDeployResult> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);

  const htmlPath = `/${slug}/index.html`;
  const htmlBuffer = Buffer.from(html, "utf-8");
  const htmlHash = md5hex(htmlBuffer);

  // Prepare new files
  const newFiles: Array<{
    path: string;
    hash: string;
    content: Buffer;
    contentType: string;
  }> = [
    {
      path: htmlPath,
      hash: htmlHash,
      content: htmlBuffer,
      contentType: "text/html",
    },
  ];

  if (additionalFiles) {
    for (const f of additionalFiles) {
      const buf = Buffer.from(
        f.body.buffer,
        f.body.byteOffset,
        f.body.byteLength
      );
      newFiles.push({
        path: f.path,
        hash: md5hex(buf),
        content: buf,
        contentType: f.path.endsWith(".webp")
          ? "image/webp"
          : "application/octet-stream",
      });
    }
  }

  // Load existing manifest and merge
  const existingManifest = await loadManifest(projectName);
  const manifest: Record<string, string> = { ...existingManifest };
  for (const f of newFiles) {
    manifest[f.path] = f.hash;
  }

  // Only upload files whose hash is not already in the existing manifest
  const existingHashes = new Set(Object.values(existingManifest));
  const filesToUpload = newFiles.filter((f) => !existingHashes.has(f.hash));

  // Get upload JWT and upload new files
  const jwt = await getUploadToken(accountId, apiToken, projectName);

  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
    await upsertHashes(
      jwt,
      filesToUpload.map((f) => f.hash)
    );
    onProgress?.(filesToUpload.length, filesToUpload.length);
  }

  // Create deployment with full manifest (existing + new)
  const deploy = await createDeployment(
    accountId,
    apiToken,
    projectName,
    manifest
  );

  // Save updated manifest
  await saveManifest(projectName, manifest);

  // Get base URL (prefer custom domain)
  const baseUrl = await getProjectBaseUrl(accountId, apiToken, projectName);

  return {
    url: `${baseUrl}/${slug}`,
    deploy_id: deploy.id,
  };
}

function injectTrackingScript(
  html: string,
  appUrl: string,
  testId: string,
  variant: "a" | "b"
): string {
  const script = `<script data-cc-injected="true">
(function(){
  var u=${JSON.stringify(appUrl + "/api/ab-track")};
  var t=${JSON.stringify(testId)};
  var v=${JSON.stringify(variant)};
  new Image().src=u+'?t='+t+'&v='+v+'&e=view&_='+Date.now();
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(a&&a.hostname!==location.hostname){
      navigator.sendBeacon(u+'?t='+t+'&v='+v+'&e=click');
    }
  });
})();
</script>`;
  return html.replace(/<\/body>/i, script + "</body>");
}

function buildRouterHtml(slug: string, split: number): string {
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, "_");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Loading...</title></head>
<body><script>
(function(){
  var k=${JSON.stringify("ab_" + safeSlug)};
  var m=document.cookie.split('; ').find(function(c){return c.startsWith(k+'=')});
  var v;
  if(m){v=m.split('=')[1]}
  else{v=Math.random()*100<${split}?'a':'b';
    document.cookie=k+'='+v+';max-age=2592000;path=/;SameSite=Lax'}
  var p=window.location.pathname;
  if(p.charAt(p.length-1)!=='/') p+='/';
  window.location.replace(p+v+'/');
})();
</script>
<noscript><a href="./a/">Click here to continue</a></noscript>
</body></html>`;
}

/**
 * Deploy an A/B test: router page + two variant pages.
 * The router redirects visitors to /a/ or /b/ based on cookie.
 */
export async function publishABTest(
  controlHtml: string,
  variantHtml: string,
  slug: string,
  language: Language,
  split: number,
  testId: string,
  appUrl: string
): Promise<ABTestDeployResult> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);

  const prefix = `/${slug}`;
  const routerPath = `${prefix}/index.html`;
  const controlPath = `${prefix}/a/index.html`;
  const variantPath = `${prefix}/b/index.html`;

  const routerHtml = buildRouterHtml(slug, split);
  const trackedControlHtml = injectTrackingScript(controlHtml, appUrl, testId, "a");
  const trackedVariantHtml = injectTrackingScript(variantHtml, appUrl, testId, "b");

  const newFiles = [
    { path: routerPath, content: Buffer.from(routerHtml, "utf-8") },
    { path: controlPath, content: Buffer.from(trackedControlHtml, "utf-8") },
    { path: variantPath, content: Buffer.from(trackedVariantHtml, "utf-8") },
  ].map((f) => ({
    ...f,
    hash: md5hex(f.content),
    contentType: "text/html",
  }));

  // Load existing manifest and merge
  const existingManifest = await loadManifest(projectName);
  const manifest: Record<string, string> = { ...existingManifest };
  for (const f of newFiles) {
    manifest[f.path] = f.hash;
  }

  const existingHashes = new Set(Object.values(existingManifest));
  const filesToUpload = newFiles.filter((f) => !existingHashes.has(f.hash));

  const jwt = await getUploadToken(accountId, apiToken, projectName);

  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
    await upsertHashes(
      jwt,
      filesToUpload.map((f) => f.hash)
    );
  }

  const deploy = await createDeployment(
    accountId,
    apiToken,
    projectName,
    manifest
  );

  await saveManifest(projectName, manifest);

  const baseUrl = await getProjectBaseUrl(accountId, apiToken, projectName);

  return {
    routerUrl: `${baseUrl}${prefix}`,
    controlUrl: `${baseUrl}${prefix}/a`,
    variantUrl: `${baseUrl}${prefix}/b`,
    deploy_id: deploy.id,
  };
}
