"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Settings, Zap, BarChart3, Image, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Landing pages", icon: Layers },
  { href: "/images", label: "Static ads", icon: Image },
  { href: "/ad-copy", label: "Ad copy", icon: MessageSquare },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              Content Hub
            </p>
            <p className="text-[10px] text-gray-400">Hälsobladet</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-600 font-medium"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200">
        <p className="text-[10px] text-gray-400">Content Hub v1.0</p>
      </div>
    </aside>
  );
}
