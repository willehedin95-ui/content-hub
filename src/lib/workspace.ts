import { cookies } from "next/headers";
import { createServerSupabase } from "./supabase-admin";
import type { Workspace } from "@/types";

const WORKSPACE_COOKIE = "ch-workspace";
const DEFAULT_WORKSPACE_SLUG = "happysleep";

// Cache workspace lookups within a single request
let _workspaceCache: Map<string, Workspace> = new Map();
let _allWorkspacesCache: Workspace[] | null = null;

/**
 * Get all workspaces (cached per process — fine for single-user app).
 * Call clearWorkspaceCache() if workspaces are modified.
 */
export async function getAllWorkspaces(): Promise<Workspace[]> {
  if (_allWorkspacesCache) return _allWorkspacesCache;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .order("created_at");

  if (error || !data) {
    console.error("Failed to fetch workspaces:", error);
    return [];
  }

  _allWorkspacesCache = data as Workspace[];
  for (const ws of _allWorkspacesCache) {
    _workspaceCache.set(ws.slug, ws);
  }
  return _allWorkspacesCache;
}

/**
 * Get the active workspace slug from the cookie.
 */
export async function getWorkspaceSlug(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(WORKSPACE_COOKIE)?.value || DEFAULT_WORKSPACE_SLUG;
}

/**
 * Get the full active workspace object.
 */
export async function getWorkspace(): Promise<Workspace> {
  const slug = await getWorkspaceSlug();

  if (_workspaceCache.has(slug)) {
    return _workspaceCache.get(slug)!;
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    // Fallback to default workspace
    const { data: fallback } = await db
      .from("workspaces")
      .select("*")
      .eq("slug", DEFAULT_WORKSPACE_SLUG)
      .single();

    if (fallback) {
      _workspaceCache.set(fallback.slug, fallback as Workspace);
      return fallback as Workspace;
    }
    throw new Error(`No workspace found for slug: ${slug}`);
  }

  const ws = data as Workspace;
  _workspaceCache.set(ws.slug, ws);
  return ws;
}

/**
 * Get the active workspace ID (UUID). Use this in queries.
 */
export async function getWorkspaceId(): Promise<string> {
  const ws = await getWorkspace();
  return ws.id;
}

/**
 * Get the settings JSONB from the active workspace.
 * Returns a plain Record (never null).
 */
export async function getWorkspaceSettings(): Promise<Record<string, unknown>> {
  const ws = await getWorkspace();
  return (ws.settings ?? {}) as Record<string, unknown>;
}

/**
 * Get the default target languages for the active workspace.
 * Falls back to ["sv", "da", "no"] if workspace has no languages configured.
 */
export async function getWorkspaceLanguages(): Promise<string[]> {
  const ws = await getWorkspace();
  return ws.languages?.length ? ws.languages : ["sv", "da", "no"];
}

/**
 * Get target languages for a workspace by its ID.
 * Useful in lib functions that receive workspaceId as a param.
 */
export async function getLanguagesByWorkspaceId(workspaceId: string): Promise<string[]> {
  const db = createServerSupabase();
  const { data } = await db
    .from("workspaces")
    .select("languages")
    .eq("id", workspaceId)
    .single();
  const langs = data?.languages as string[] | null;
  return langs?.length ? langs : ["sv", "da", "no"];
}

/**
 * Get the language ad copy should be generated in for a workspace.
 * Returns "en" (English) by default. Set settings.ad_copy_language to
 * override (e.g. "sv" for Swedish-first generation).
 */
export async function getAdCopyLanguageByWorkspaceId(workspaceId: string): Promise<string> {
  const db = createServerSupabase();
  const { data } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const settings = data?.settings as Record<string, unknown> | null;
  return (settings?.ad_copy_language as string) || "en";
}

/**
 * Clear the workspace cache. Call after modifying workspaces.
 */
export function clearWorkspaceCache() {
  _workspaceCache = new Map();
  _allWorkspacesCache = null;
}
