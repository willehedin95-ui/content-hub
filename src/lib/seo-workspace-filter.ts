import type { SupabaseClient } from "@supabase/supabase-js";
import type { GscProperty } from "@/types";

export interface WorkspacePageFilter {
  mySlugs: Set<string>;
  othersSlugs: Set<string>;
  primaryProperties: Set<string>;
}

export async function buildWorkspacePageFilter(
  db: SupabaseClient,
  workspaceId: string,
  properties: GscProperty[]
): Promise<WorkspacePageFilter> {
  const [mineRes, othersRes] = await Promise.all([
    db
      .from("translations")
      .select("slug, pages!inner(workspace_id)")
      .eq("pages.workspace_id", workspaceId)
      .not("slug", "is", null),
    db
      .from("translations")
      .select("slug, pages!inner(workspace_id)")
      .neq("pages.workspace_id", workspaceId)
      .not("slug", "is", null),
  ]);

  const mySlugs = new Set(
    ((mineRes.data ?? []) as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean)
  );
  const othersSlugs = new Set(
    ((othersRes.data ?? []) as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean)
  );
  const primaryProperties = new Set(
    properties.filter((p) => p.is_primary !== false).map((p) => p.property)
  );

  return { mySlugs, othersSlugs, primaryProperties };
}

export function extractSlug(pageUrl: string): string | null {
  if (!pageUrl) return null;
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

export function pageMatchesWorkspace(
  pageUrl: string,
  property: string,
  filter: WorkspacePageFilter
): boolean {
  const slug = extractSlug(pageUrl);
  if (!slug) return filter.primaryProperties.has(property);
  if (filter.mySlugs.has(slug)) return true;
  if (filter.othersSlugs.has(slug)) return false;
  return filter.primaryProperties.has(property);
}
