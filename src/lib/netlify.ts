import { Language } from "@/types";

interface NetlifyDeployResult {
  url: string;
  deploy_id: string;
}

/**
 * Deploy a single HTML file to a Netlify site.
 * Uses the Files API to update just one file without a full deploy.
 */
export async function publishPage(
  html: string,
  slug: string,
  language: Language,
  token: string,
  siteId: string
): Promise<NetlifyDeployResult> {
  // Norwegian pages go in /no/ subdirectory on the Swedish site
  const filePath =
    language === "no" ? `/no/${slug}/index.html` : `/${slug}/index.html`;

  // Create a new deploy with just this file
  const deployRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: {
          [filePath]: await sha1(html),
        },
        async: false,
      }),
    }
  );

  if (!deployRes.ok) {
    const err = await deployRes.text();
    throw new Error(`Netlify deploy creation failed: ${err}`);
  }

  const deploy = (await deployRes.json()) as { id: string; required: string[] };

  // Upload the HTML file
  const uploadRes = await fetch(
    `https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: html,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Netlify file upload failed: ${err}`);
  }

  // Get site info for the URL
  const siteRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const site = (await siteRes.json()) as { custom_domain?: string; url: string };
  // Prefer custom domain if connected, otherwise use Netlify preview URL
  const baseUrl = site.custom_domain
    ? `https://${site.custom_domain}`
    : site.url;

  const pagePath = language === "no" ? `/no/${slug}` : `/${slug}`;

  return {
    url: `${baseUrl}${pagePath}`,
    deploy_id: deploy.id,
  };
}

interface ABTestDeployResult {
  routerUrl: string;
  controlUrl: string;
  variantUrl: string;
  deploy_id: string;
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
  token: string,
  siteId: string,
  testId: string,
  appUrl: string
): Promise<ABTestDeployResult> {
  const prefix = language === "no" ? `/no/${slug}` : `/${slug}`;
  const routerPath = `${prefix}/index.html`;
  const controlPath = `${prefix}/a/index.html`;
  const variantPath = `${prefix}/b/index.html`;

  const routerHtml = buildRouterHtml(slug, split);

  // Inject tracking scripts into both variants
  const trackedControlHtml = injectTrackingScript(controlHtml, appUrl, testId, "a");
  const trackedVariantHtml = injectTrackingScript(variantHtml, appUrl, testId, "b");

  // Create deploy with all 3 files
  const deployRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: {
          [routerPath]: await sha1(routerHtml),
          [controlPath]: await sha1(trackedControlHtml),
          [variantPath]: await sha1(trackedVariantHtml),
        },
        async: false,
      }),
    }
  );

  if (!deployRes.ok) {
    const err = await deployRes.text();
    throw new Error(`Netlify A/B deploy creation failed: ${err}`);
  }

  const deploy = (await deployRes.json()) as { id: string; required: string[] };

  // Upload all 3 files
  for (const [path, html] of [
    [routerPath, routerHtml],
    [controlPath, trackedControlHtml],
    [variantPath, trackedVariantHtml],
  ] as const) {
    const uploadRes = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deploy.id}/files${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: html,
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Netlify A/B file upload failed (${path}): ${err}`);
    }
  }

  // Get site info for URLs
  const siteRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const site = (await siteRes.json()) as { custom_domain?: string; url: string };
  const baseUrl = site.custom_domain
    ? `https://${site.custom_domain}`
    : site.url;

  return {
    routerUrl: `${baseUrl}${prefix}`,
    controlUrl: `${baseUrl}${prefix}/a`,
    variantUrl: `${baseUrl}${prefix}/b`,
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
  var u='${appUrl}/api/ab-track';
  var t='${testId}';
  var v='${variant}';
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
  var k='ab_${safeSlug}';
  var m=document.cookie.match(new RegExp(k+'=(\\\\w+)'));
  var v;
  if(m){v=m[1]}
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

async function sha1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
