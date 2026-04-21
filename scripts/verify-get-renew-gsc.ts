import { google } from "googleapis";

const HOSTINGER_TOKEN = "yGjknxOuDCSLPIri0HRZ9jcPsuCujZTnvCgr0pdP4b895c7a";
const DOMAIN = "get-renew.com";

async function requestTxtToken() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account not configured");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/siteverification"],
  });
  const sv = google.siteVerification("v1");

  console.log("[1/5] Requesting TXT verification token...");
  const tokenRes = await sv.webResource.getToken({
    auth,
    requestBody: {
      verificationMethod: "DNS_TXT",
      site: { type: "INET_DOMAIN", identifier: DOMAIN },
    },
  });
  const txtToken = tokenRes.data.token;
  if (!txtToken) throw new Error("No token returned");
  console.log("    Token:", txtToken);
  return { auth, sv, txtToken };
}

async function addDnsTxt(txtToken: string) {
  console.log("[2/5] Adding TXT record to Hostinger DNS...");
  const existing = await fetch(
    `https://developers.hostinger.com/api/dns/v1/zones/${DOMAIN}`,
    { headers: { Authorization: `Bearer ${HOSTINGER_TOKEN}` } }
  );
  if (!existing.ok) {
    console.error("    Failed to fetch zone:", existing.status, await existing.text());
    throw new Error("Zone fetch failed");
  }
  const zone = await existing.json();
  const rootTxtBlock = zone.find((r: any) => r.name === "@" && r.type === "TXT");
  const existingRecords: Array<{ content: string }> = rootTxtBlock?.records ?? [];
  const alreadyHas = existingRecords.some((r) => r.content.includes(txtToken));

  if (alreadyHas) {
    console.log("    TXT record already present");
    return;
  }

  const merged = [
    ...existingRecords.map((r) => ({ content: r.content })),
    { content: `"${txtToken}"` },
  ];
  console.log("    PUT body records:", JSON.stringify(merged, null, 2));

  // Hostinger rejects merging into an existing (name,type) block with
  // overwrite:false. Delete the block first, then recreate with the merged set.
  console.log("    Deleting existing @ TXT block...");
  const delRes = await fetch(
    `https://developers.hostinger.com/api/dns/v1/zones/${DOMAIN}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${HOSTINGER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filters: [{ name: "@", type: "TXT" }] }),
    }
  );
  if (!delRes.ok) {
    console.error("    DELETE failed:", delRes.status, await delRes.text());
    throw new Error("DNS delete failed");
  }

  const putRes = await fetch(
    `https://developers.hostinger.com/api/dns/v1/zones/${DOMAIN}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${HOSTINGER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone: [
          {
            name: "@",
            type: "TXT",
            ttl: 300,
            records: merged,
          },
        ],
        overwrite: false,
      }),
    }
  );
  if (!putRes.ok) {
    console.error("    Hostinger PUT failed:", putRes.status, await putRes.text());
    throw new Error("DNS update failed");
  }
  console.log("    TXT record added");
}

async function waitForDnsPropagation(txtToken: string) {
  console.log("[3/5] Waiting for DNS propagation...");
  const dns = await import("node:dns/promises");
  const start = Date.now();
  const timeout = 5 * 60 * 1000;
  while (Date.now() - start < timeout) {
    try {
      const records = await dns.resolveTxt(DOMAIN);
      const flat = records.flat();
      if (flat.some((r) => r.includes(txtToken))) {
        console.log("    TXT record visible in DNS (took " + Math.round((Date.now() - start) / 1000) + "s)");
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("DNS propagation timeout");
}

async function verifyOwnership(auth: any, sv: any) {
  console.log("[4/5] Calling Site Verification API to verify ownership...");
  const res = await sv.webResource.insert({
    auth,
    verificationMethod: "DNS_TXT",
    requestBody: {
      site: { type: "INET_DOMAIN", identifier: DOMAIN },
    },
  });
  console.log("    Verified:", JSON.stringify(res.data, null, 2));
}

async function addSiteToGsc() {
  console.log("[5/5] Adding sc-domain:" + DOMAIN + " to GSC...");
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account not configured");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });
  const sc = google.searchconsole("v1");
  const siteUrl = `sc-domain:${DOMAIN}`;
  await sc.sites.add({ auth, siteUrl });
  console.log("    Added " + siteUrl);
}

async function main() {
  const { auth, sv, txtToken } = await requestTxtToken();
  await addDnsTxt(txtToken);
  await waitForDnsPropagation(txtToken);
  await verifyOwnership(auth, sv);
  await addSiteToGsc();
  console.log("Done.");
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
