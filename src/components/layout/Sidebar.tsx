"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Layers, Settings, Zap, Image, FlaskConical, LogOut, Package, BarChart3, Eye, Lightbulb, ChevronDown, Megaphone, Workflow, Activity, Warehouse, Sun, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number };
type NavGroup = { label: string; icon: React.ComponentType<{ className?: string }>; children: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

interface Progress {
  processing: boolean;
  completed: number;
  total: number;
}

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pipelineBadgeCount, setPipelineBadgeCount] = useState(0);

  // Auto-open groups that contain the active route
  const groupOpenByDefault = (group: NavGroup) =>
    group.children.some(
      (c) => pathname === c.href || pathname.startsWith(c.href + "/")
    );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const nav: NavEntry[] = useMemo(() => [
    { href: "/", label: "Business Pulse", icon: Activity },
    { href: "/pages", label: "Landing Pages", icon: Layers },
    { href: "/ab-tests", label: "A/B Tests", icon: FlaskConical },
    {
      label: "Ads",
      icon: Megaphone,
      children: [
        { href: "/pipeline", label: "Ad Tracker", icon: Workflow },
        { href: "/brainstorm", label: "Brainstorm", icon: Lightbulb, badge: pipelineBadgeCount > 0 ? pipelineBadgeCount : undefined },
        { href: "/images", label: "Static Ads", icon: Image },
        { href: "/ad-library", label: "Ad Library", icon: Eye },
        { href: "/hooks", label: "Hook Bank", icon: Library },
      ],
    },
    { href: "/products", label: "Products", icon: Package },
    { href: "/stock", label: "Inventory", icon: Warehouse },
    { href: "/performance", label: "Performance", icon: BarChart3 },
    { href: "/morning-brief", label: "Morning Brief", icon: Sun },
  ], [pipelineBadgeCount]);

  // Initialize open state based on current route (once on mount + route changes)
  useEffect(() => {
    const newOpen: Record<string, boolean> = {};
    for (const entry of nav) {
      if (isGroup(entry) && groupOpenByDefault(entry)) {
        newOpen[entry.label] = true;
      }
    }
    setOpenGroups((prev) => ({ ...prev, ...newOpen }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/image-jobs/progress");
      if (res.ok) setProgress(await res.json());
    } catch {
      // silently ignore
    }
  }, []);

  // Poll frequently while processing, slowly when idle (to detect new jobs)
  useEffect(() => {
    fetchProgress();
    const ms = progress?.processing ? 10_000 : 60_000;
    const interval = setInterval(fetchProgress, ms);
    return () => clearInterval(interval);
  }, [fetchProgress, progress?.processing]);

  // Poll pipeline badge count every 30s
  useEffect(() => {
    const fetchPipelineBadge = async () => {
      try {
        const res = await fetch("/api/pipeline/badge-count");
        if (res.ok) {
          const data = await res.json();
          setPipelineBadgeCount(data.count || 0);
        }
      } catch {
        // silently ignore
      }
    };

    fetchPipelineBadge();
    const interval = setInterval(fetchPipelineBadge, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");
  }

  function renderNavItem(item: NavItem, indent = false) {
    const active = isActive(item.href);
    const Icon = item.icon;
    const showProgress =
      item.href === "/images" && progress?.processing && progress.total > 0;
    const pct =
      showProgress && progress
        ? Math.round((progress.completed / progress.total) * 100)
        : 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex flex-col gap-0.5 px-3 py-2 rounded-md text-sm transition-colors",
          indent && "pl-10",
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {item.badge !== undefined && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium tabular-nums">
              {item.badge}
            </span>
          )}
          {showProgress && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {progress!.completed}/{progress!.total}
            </span>
          )}
        </div>
        {showProgress && (
          <div className="ml-7 h-1.5 rounded-full bg-accent overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground/30 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Link>
    );
  }

  function renderGroup(group: NavGroup) {
    const open = openGroups[group.label] ?? false;
    const Icon = group.icon;
    const hasActiveChild = group.children.some((c) => isActive(c.href));

    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            hasActiveChild
              ? "text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 shrink-0 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {group.children.map((child) => renderNavItem(child, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-56 h-screen bg-background border-r border-border flex flex-col shrink-0 sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
            <Zap className="w-4 h-4 text-background" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">
              Content Hub
            </p>
            <p className="text-xs text-muted-foreground">Hälsobladet</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((entry) =>
          isGroup(entry) ? renderGroup(entry) : renderNavItem(entry)
        )}
      </nav>

      {/* Settings - pinned bottom */}
      <div className="px-3 pb-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-border">
        {userEmail && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate flex-1 mr-2" title={userEmail}>
              {userEmail}
            </p>
            <button
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
          v{process.env.NEXT_PUBLIC_BUILD_ID}
        </p>
      </div>
    </aside>
  );
}
