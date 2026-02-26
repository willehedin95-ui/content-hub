"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Layers, Settings, Zap, Image, FlaskConical, LogOut, Package, BarChart3, LayoutDashboard, Eye, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pages", label: "Landing Pages", icon: Layers },
  { href: "/ab-tests", label: "A/B Tests", icon: FlaskConical },
  { href: "/images", label: "Ad Concepts", icon: Image },
  { href: "/products", label: "Products", icon: Package },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/spy", label: "Ad Spy", icon: Eye },
  { href: "/brainstorm", label: "Brainstorm", icon: Lightbulb },
];

interface Progress {
  processing: boolean;
  completed: number;
  total: number;
}

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);

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

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
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
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          const showProgress =
            href === "/images" && progress?.processing && progress.total > 0;
          const pct =
            showProgress && progress
              ? Math.round((progress.completed / progress.total) * 100)
              : 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col gap-0.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
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
        })}
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
