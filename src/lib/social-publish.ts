/**
 * Organic publishing to Instagram + Facebook for a workspace (Envana first).
 *
 * Uses the hub's Meta system user token (never expires). The workspace's
 * Facebook Page and its connected Instagram account must be assigned to that
 * system user in Business settings (done for Envana 2026-10-05). IDs live in
 * workspaces.settings.social = { ig_user_id, fb_page_id }.
 *
 * Rules carried over from @thehealthgraph's publisher (izabella-v2/tools/autopilot.py)
 * and this repo's Meta rules:
 * - Only APPROVED posts are published. Nothing else is ever picked.
 * - One post per run, and the row is claimed (approved -> publishing) before
 *   any Meta call, so two overlapping runs can never take the same post.
 * - No retries on calls that create a post: after a timeout the outcome is
 *   unknown and a retry can publish twice.
 * - Instagram and Facebook are independent: a failure on one is recorded and
 *   never undoes or blocks the other.
 * - Images must be JPEG at a public URL (Instagram rejects other formats).
 */
import { createServerSupabase } from "@/lib/supabase-admin";

const GRAPH = "https://graph.facebook.com/v22.0";

export interface SocialPost {
  id: string;
  workspace_id: string;
  scheduled_at: string;
  format: "image" | "carousel";
  media_urls: string[];
  caption: string;
  status: string;
}

interface SocialConfig {
  ig_user_id?: string;
  fb_page_id?: string;
}

function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) throw new Error("META_SYSTEM_USER_TOKEN is not set");
  return t;
}

async function graph(method: "GET" | "POST", path: string, params: Record<string, string>, accessToken: string) {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const url = method === "GET" ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, {
    method,
    ...(method === "POST" ? { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

// --- Instagram -------------------------------------------------------------

/** Wait until a media container has finished processing (images are usually instant). */
async function waitForContainer(id: string, accessToken: string) {
  for (let i = 0; i < 20; i++) {
    const { status_code } = await graph("GET", id, { fields: "status_code" }, accessToken);
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`container ${id}: ${status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`container ${id}: not finished after 60s`);
}

export async function publishInstagram(post: SocialPost, igUserId: string): Promise<string> {
  const t = token();
  let creationId: string;
  if (post.format === "carousel") {
    const children: string[] = [];
    for (const url of post.media_urls) {
      const c = await graph("POST", `${igUserId}/media`, { image_url: url, is_carousel_item: "true" }, t);
      children.push(c.id);
    }
    for (const c of children) await waitForContainer(c, t);
    const parent = await graph("POST", `${igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption }, t);
    creationId = parent.id;
  } else {
    const c = await graph("POST", `${igUserId}/media`, { image_url: post.media_urls[0], caption: post.caption }, t);
    creationId = c.id;
  }
  await waitForContainer(creationId, t);
  // The only call that makes the post public. Never retried.
  const published = await graph("POST", `${igUserId}/media_publish`, { creation_id: creationId }, t);
  return published.id as string;
}

// --- Facebook --------------------------------------------------------------

async function pageToken(pageId: string): Promise<string> {
  const { access_token } = await graph("GET", pageId, { fields: "access_token" }, token());
  if (!access_token) throw new Error("no Page access token - is the Page assigned to the system user?");
  return access_token;
}

export async function publishFacebook(post: SocialPost, pageId: string): Promise<string> {
  const pt = await pageToken(pageId);
  if (post.format === "image") {
    const r = await graph("POST", `${pageId}/photos`, { url: post.media_urls[0], caption: post.caption }, pt);
    return (r.post_id ?? r.id) as string;
  }
  // Carousel -> one post with several photos: upload unpublished, then attach.
  const ids: string[] = [];
  for (const url of post.media_urls) {
    const p = await graph("POST", `${pageId}/photos`, { url, published: "false" }, pt);
    ids.push(p.id);
  }
  const params: Record<string, string> = { message: post.caption };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const r = await graph("POST", `${pageId}/feed`, params, pt);
  return r.id as string;
}

// --- Runner ----------------------------------------------------------------

export interface PublishResult {
  post_id: string | null;
  ig?: string;
  fb?: string;
  ig_error?: string;
  fb_error?: string;
  note?: string;
}

/** Publish ONE approved post that is due. Returns what happened. */
export async function publishNextDue(): Promise<PublishResult> {
  const db = createServerSupabase();
  const { data: due } = await db
    .from("social_posts")
    .select("*")
    .eq("status", "approved")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1);
  const post = due?.[0] as SocialPost | undefined;
  if (!post) return { post_id: null, note: "nothing due" };

  // Claim it. If another run got there first, the update matches no row.
  const { data: claimed } = await db
    .from("social_posts")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("status", "approved")
    .select("id");
  if (!claimed?.length) return { post_id: post.id, note: "claimed by another run" };

  const { data: ws } = await db.from("workspaces").select("settings").eq("id", post.workspace_id).single();
  const cfg = ((ws?.settings as Record<string, unknown> | null)?.social ?? {}) as SocialConfig;
  const result: PublishResult = { post_id: post.id };

  if (cfg.ig_user_id) {
    try {
      result.ig = await publishInstagram(post, cfg.ig_user_id);
      // Record immediately: a later failure must not make this look unposted.
      await db.from("social_posts").update({ ig_media_id: result.ig }).eq("id", post.id);
    } catch (e) {
      result.ig_error = e instanceof Error ? e.message : String(e);
    }
  } else result.ig_error = "no ig_user_id in workspace settings";

  if (cfg.fb_page_id) {
    try {
      result.fb = await publishFacebook(post, cfg.fb_page_id);
      await db.from("social_posts").update({ fb_post_id: result.fb }).eq("id", post.id);
    } catch (e) {
      result.fb_error = e instanceof Error ? e.message : String(e);
    }
  } else result.fb_error = "no fb_page_id in workspace settings";

  const anyPosted = !!(result.ig || result.fb);
  await db.from("social_posts").update({
    status: anyPosted ? "posted" : "failed",
    posted_at: anyPosted ? new Date().toISOString() : null,
    ig_error: result.ig_error ?? null,
    fb_error: result.fb_error ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", post.id);
  return result;
}
