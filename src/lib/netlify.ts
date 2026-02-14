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

async function sha1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
