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

function getProjectCustomDomain(language: Language): string | undefined {
  const key = `CF_PAGES_DOMAIN_${language.toUpperCase()}`;
  return process.env[key]?.trim() || undefined;
}

async function getProjectBaseUrl(
  accountId: string,
  apiToken: string,
  projectName: string,
  language: Language
): Promise<string> {
  // Prefer explicit custom domain env var (CF_PAGES_DOMAIN_SV, etc.)
  const envDomain = getProjectCustomDomain(language);
  if (envDomain) return `https://${envDomain}`;

  // Fall back to CF API detection
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
  onProgress?: (current: number, total: number) => void,
  analytics?: PageAnalyticsConfig
): Promise<CFDeployResult> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);

  // Inject analytics scripts if configured
  if (analytics) {
    html = injectPageAnalytics(html, { ...analytics, slug });
  }

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
  const baseUrl = await getProjectBaseUrl(accountId, apiToken, projectName, language);

  return {
    url: `${baseUrl}/${slug}`,
    deploy_id: deploy.id,
  };
}

/**
 * Analytics config for all published pages (regular + AB test).
 * AB test context is optional — only set for AB test variant pages.
 */
export interface PageAnalyticsConfig {
  ga4MeasurementId?: string;
  clarityProjectId?: string;
  shopifyDomains?: string[];
  metaPixelId?: string;
  /** Page slug — used for UTM campaign on non-AB pages */
  slug?: string;
  /** AB test context — only set for AB test variant pages */
  abTest?: { testId: string; variant: "a" | "b" };
  /** Hub URL for IP-based tracking opt-out check */
  hubUrl?: string;
  /** IPs excluded from tracking (baked into page for fast check) */
  excludedIps?: string[];
}

/** Meta Pixel — tracks page views and outbound CTA clicks for Meta ad optimization */
function injectMetaPixel(html: string, pixelId: string): string {
  if (html.includes('data-cc-fbpixel="true"')) return html;
  const script = `<!-- Meta Pixel -->
<script data-cc-fbpixel="true">
if(!window.__chOptout){
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${JSON.stringify(pixelId)});
fbq('track','PageView');
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  try{
    var u=new URL(a.href,location.href);
    if(u.hostname===location.hostname)return;
    fbq('trackCustom','CtaClick',{link_url:a.href});
  }catch(err){}
},true);
}
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}

function injectClarityScript(html: string, projectId: string): string {
  if (html.includes('data-cc-clarity="true"')) return html;
  const script = `<!-- Clarity -->
<script data-cc-clarity="true">
if(!window.__chOptout){
(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window,document,"clarity","script",${JSON.stringify(projectId)});
}
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}

/**
 * Analytics opt-out script — injected before all tracking.
 * Checks visitor IP against excluded list (baked into page).
 * On first visit: calls hub API to get visitor IP, checks against list, sets cookie.
 * On subsequent visits: cookie check is instant (no API call).
 * Manual override: ?_ch_optout=1 to force opt-out, ?_ch_optout=0 to re-enable.
 */
function injectOptOutScript(html: string, hubUrl?: string, excludedIps?: string[]): string {
  if (html.includes('data-cc-optout="true"')) return html;
  const ips = JSON.stringify(excludedIps ?? []);
  const apiUrl = hubUrl ? JSON.stringify(hubUrl + "/api/tracking-optout") : "null";
  const script = `<script data-cc-optout="true">
(function(){
  var c=document.cookie;
  // Check existing cookie first (instant, no API call)
  if(c.indexOf('_ch_optout=1')!==-1){window.__chOptout=true;return}
  if(c.indexOf('_ch_optout=0')!==-1){return}
  // Manual URL override
  var p=new URLSearchParams(location.search);
  if(p.get('_ch_optout')==='1'){
    document.cookie='_ch_optout=1;path=/;max-age=31536000;SameSite=Lax';
    window.__chOptout=true;return;
  }else if(p.get('_ch_optout')==='0'){
    document.cookie='_ch_optout=0;path=/;max-age=31536000;SameSite=Lax';
    return;
  }
  // IP check: call hub API to verify (only on first visit, before cookie is set)
  var ips=${ips};var api=${apiUrl};
  if(ips.length>0&&api){
    var x=new XMLHttpRequest();
    x.open('GET',api,false);// synchronous to block tracking scripts
    try{
      x.send();
      if(x.status===200){
        var r=JSON.parse(x.responseText);
        if(r.optout){
          document.cookie='_ch_optout=1;path=/;max-age=31536000;SameSite=Lax';
          window.__chOptout=true;return;
        }else{
          document.cookie='_ch_optout=0;path=/;max-age=31536000;SameSite=Lax';
        }
      }
    }catch(e){}
  }
})();
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}

/**
 * Inject all configured analytics scripts into HTML.
 * Used by both publishPage() and publishABTest().
 */
function injectPageAnalytics(html: string, config: PageAnalyticsConfig): string {
  // Opt-out guard (must be injected first)
  html = injectOptOutScript(html, config.hubUrl, config.excludedIps);

  // GA4 (with cross-domain linking to Shopify)
  if (config.ga4MeasurementId) {
    if (config.abTest) {
      html = injectGA4Script(html, config.ga4MeasurementId, config.abTest.testId, config.abTest.variant, config.shopifyDomains);
    } else {
      html = injectGA4ScriptBasic(html, config.ga4MeasurementId, config.shopifyDomains);
    }
  }

  // Clarity
  if (config.clarityProjectId) {
    html = injectClarityScript(html, config.clarityProjectId);
  }

  // Meta Pixel
  if (config.metaPixelId) {
    html = injectMetaPixel(html, config.metaPixelId);
  }

  // First-party tracking pixel (after Meta Pixel so _fbp cookie is likely set)
  if (config.hubUrl && config.slug) {
    html = injectFirstPartyPixel(html, config.hubUrl, config.slug);
  }

  // UTM link rewriting
  if (config.shopifyDomains?.length) {
    if (config.abTest) {
      html = injectUTMRewriter(html, config.abTest.testId, config.abTest.variant, config.shopifyDomains);
    } else if (config.slug) {
      html = injectUTMRewriterPage(html, config.slug, config.shopifyDomains);
    }
  }

  return html;
}

/** First-party tracking pixel — captures visitor ID, fbclid, _fbp cookie, UTM params */
function injectFirstPartyPixel(html: string, hubUrl: string, slug: string): string {
  if (html.includes('data-cc-chpixel="true"')) return html;

  const script = `<!-- CH Pixel -->
<script data-cc-chpixel="true">
if(!window.__chOptout){
(function(){
var vid;
var c=document.cookie.split('; ').find(function(r){return r.startsWith('_ch_vid=')});
if(c){vid=c.split('=')[1]}
else{
vid='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16)
});
document.cookie='_ch_vid='+vid+';path=/;max-age=31536000;SameSite=Lax';
}
var p=new URLSearchParams(location.search);
var q='vid='+encodeURIComponent(vid)+'&e=view';
q+='&slug='+encodeURIComponent(${JSON.stringify(slug)});
q+='&url='+encodeURIComponent(location.href);
q+='&ref='+encodeURIComponent(document.referrer||'');
q+='&domain='+encodeURIComponent(location.hostname);
var fbclid=p.get('fbclid');
if(fbclid)q+='&fbclid='+encodeURIComponent(fbclid);
var ck=document.cookie;
var fbpM=ck.match(/(?:^|;\\s*)_fbp=([^;]+)/);
if(fbpM)q+='&fbp='+encodeURIComponent(fbpM[1]);
var fbcM=ck.match(/(?:^|;\\s*)_fbc=([^;]+)/);
if(fbcM)q+='&fbc='+encodeURIComponent(fbcM[1]);
['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
var v=p.get(k);if(v)q+='&'+k+'='+encodeURIComponent(v);
});
var u=${JSON.stringify(hubUrl + "/api/pixel")};
new Image().src=u+'?'+q+'&_='+Date.now();
document.addEventListener('click',function(ev){
var a=ev.target.closest('a[href]');
if(!a)return;
try{
var url=new URL(a.href,location.href);
if(url.hostname===location.hostname)return;
var cq='vid='+encodeURIComponent(vid)+'&e=click';
cq+='&slug='+encodeURIComponent(${JSON.stringify(slug)});
cq+='&click='+encodeURIComponent(a.href);
cq+='&domain='+encodeURIComponent(location.hostname);
if(fbclid)cq+='&fbclid='+encodeURIComponent(fbclid);
if(fbpM)cq+='&fbp='+encodeURIComponent(fbpM[1]);
navigator.sendBeacon(u+'?'+cq);
}catch(e){}
},true);
})();
}
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
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

function injectUTMRewriter(
  html: string,
  testId: string,
  variant: "a" | "b",
  shopifyDomains: string[]
): string {
  if (shopifyDomains.length === 0) return html;
  const script = `<script data-cc-utm="true">
(function(){
  var t=${JSON.stringify(testId)};
  var v=${JSON.stringify(variant)};
  var d=${JSON.stringify(shopifyDomains)};
  var p=new URLSearchParams(location.search);
  var src=p.get('utm_source')||'';
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('a[href]').forEach(function(a){
      try{
        var u=new URL(a.href,location.href);
        if(!d.some(function(h){return u.hostname.indexOf(h)!==-1}))return;
        if(src){
          // Visitor came from an ad — preserve original UTMs
          ['utm_source','utm_medium','utm_campaign','utm_content','utm_adset'].forEach(function(k){
            var val=p.get(k);if(val)u.searchParams.set(k,val);
          });
          // Add AB test info as additional params
          u.searchParams.set('utm_term',t+'_'+v);
        }else{
          // Direct/organic — set AB test UTMs
          u.searchParams.set('utm_source','abtest');
          u.searchParams.set('utm_medium','landingpage');
          u.searchParams.set('utm_campaign',t);
          u.searchParams.set('utm_content',v);
        }
        a.href=u.toString();
      }catch(e){}
    });
  });
})();
</script>`;
  return html.replace(/<\/body>/i, script + "</body>");
}

/**
 * Inline JS that tracks outbound CTA clicks and scroll depth as GA4 events.
 * Injected into every published page alongside the basic gtag config.
 */
const GA4_ENGAGEMENT_TRACKING = `
// Track outbound link clicks
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(!a)return;
  try{
    var u=new URL(a.href,location.href);
    if(u.hostname===location.hostname)return;
    gtag('event','cta_click',{
      link_url:a.href,
      link_text:(a.textContent||'').trim().substring(0,100),
      outbound:true
    });
  }catch(err){}
},true);
// Track scroll milestones (25%, 50%, 75%, 100%)
(function(){
  var fired={};
  function check(){
    var h=document.documentElement.scrollHeight-window.innerHeight;
    if(h<=0)return;
    var pct=Math.round(window.scrollY/h*100);
    [25,50,75,100].forEach(function(m){
      if(pct>=m&&!fired[m]){
        fired[m]=true;
        gtag('event','scroll_depth',{percent:m});
      }
    });
  }
  window.addEventListener('scroll',check,{passive:true});
})();`;

function injectGA4Script(
  html: string,
  measurementId: string,
  testId: string,
  variant: "a" | "b",
  shopifyDomains?: string[]
): string {
  const linkerConfig = shopifyDomains?.length
    ? `,{linker:{domains:${JSON.stringify(shopifyDomains)},accept_incoming:true}}`
    : "";
  const script = `<!-- GA4 -->
<script>
if(!window.__chOptout){
var _gs=document.createElement('script');_gs.async=true;
_gs.src='https://www.googletagmanager.com/gtag/js?id=${measurementId}';
document.head.appendChild(_gs);
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;
gtag('js',new Date());
gtag('config',${JSON.stringify(measurementId)}${linkerConfig});
gtag('event','ab_test_view',{test_id:${JSON.stringify(testId)},variant:${JSON.stringify(variant)}});
${GA4_ENGAGEMENT_TRACKING}
}
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}

/** GA4 injection for regular pages (no AB test event) */
function injectGA4ScriptBasic(html: string, measurementId: string, shopifyDomains?: string[]): string {
  if (html.includes('data-cc-ga4="true"')) return html;
  // Cross-domain linker config so GA4 session continues to Shopify
  const linkerConfig = shopifyDomains?.length
    ? `,{linker:{domains:${JSON.stringify(shopifyDomains)},accept_incoming:true}}`
    : "";
  const script = `<!-- GA4 -->
<script data-cc-ga4="true">
if(!window.__chOptout){
var _gs=document.createElement('script');_gs.async=true;
_gs.src='https://www.googletagmanager.com/gtag/js?id=${measurementId}';
document.head.appendChild(_gs);
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;
gtag('js',new Date());
gtag('config',${JSON.stringify(measurementId)}${linkerConfig});
${GA4_ENGAGEMENT_TRACKING}
}
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}

/** UTM link rewriting for regular pages.
 * Smart: reads incoming UTM params from the page URL (e.g. from Meta ads)
 * and passes them through to Shopify links, adding the page slug as utm_term.
 * If no incoming UTM params, defaults to utm_source=page, utm_campaign=<slug>.
 */
function injectUTMRewriterPage(
  html: string,
  slug: string,
  shopifyDomains: string[]
): string {
  if (shopifyDomains.length === 0) return html;
  if (html.includes('data-cc-utm="true"')) return html;
  const script = `<script data-cc-utm="true">
(function(){
  var s=${JSON.stringify(slug)};
  var d=${JSON.stringify(shopifyDomains)};
  var p=new URLSearchParams(location.search);
  var src=p.get('utm_source')||'';
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('a[href]').forEach(function(a){
      try{
        var u=new URL(a.href,location.href);
        if(!d.some(function(h){return u.hostname.indexOf(h)!==-1}))return;
        if(src){
          // Visitor came from an ad or known source — preserve original UTMs
          ['utm_source','utm_medium','utm_campaign','utm_content','utm_adset'].forEach(function(k){
            var v=p.get(k);if(v)u.searchParams.set(k,v);
          });
          // Add page slug as utm_term for page-level attribution
          u.searchParams.set('utm_term',s);
        }else{
          // Direct/organic visit — set page-level UTMs
          u.searchParams.set('utm_source','page');
          u.searchParams.set('utm_medium','landingpage');
          u.searchParams.set('utm_campaign',s);
        }
        a.href=u.toString();
      }catch(e){}
    });
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
export interface ABTestAnalyticsConfig {
  ga4MeasurementId?: string;
  clarityProjectId?: string;
  shopifyDomains?: string[];
  hubUrl?: string;
  excludedIps?: string[];
}

export async function publishABTest(
  controlHtml: string,
  variantHtml: string,
  slug: string,
  language: Language,
  split: number,
  testId: string,
  appUrl: string,
  analytics?: ABTestAnalyticsConfig
): Promise<ABTestDeployResult> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);

  const prefix = `/${slug}`;
  const routerPath = `${prefix}/index.html`;
  const controlPath = `${prefix}/a/index.html`;
  const variantPath = `${prefix}/b/index.html`;

  const routerHtml = buildRouterHtml(slug, split);
  // Inject AB test tracking pixel
  let trackedControlHtml = injectTrackingScript(controlHtml, appUrl, testId, "a");
  let trackedVariantHtml = injectTrackingScript(variantHtml, appUrl, testId, "b");

  // Inject analytics (GA4, Clarity, UTM) via shared helper
  const controlAnalytics: PageAnalyticsConfig = {
    ga4MeasurementId: analytics?.ga4MeasurementId,
    clarityProjectId: analytics?.clarityProjectId,
    shopifyDomains: analytics?.shopifyDomains,
    hubUrl: analytics?.hubUrl,
    excludedIps: analytics?.excludedIps,
    slug,
    abTest: { testId, variant: "a" },
  };
  const variantAnalytics: PageAnalyticsConfig = {
    ...controlAnalytics,
    abTest: { testId, variant: "b" },
  };
  trackedControlHtml = injectPageAnalytics(trackedControlHtml, controlAnalytics);
  trackedVariantHtml = injectPageAnalytics(trackedVariantHtml, variantAnalytics);

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

  const baseUrl = await getProjectBaseUrl(accountId, apiToken, projectName, language);

  return {
    routerUrl: `${baseUrl}${prefix}`,
    controlUrl: `${baseUrl}${prefix}/a`,
    variantUrl: `${baseUrl}${prefix}/b`,
    deploy_id: deploy.id,
  };
}
