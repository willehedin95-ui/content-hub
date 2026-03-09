import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import AgentationWrapper from "@/components/ui/AgentationWrapper";
import { createAuthServerClient } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Content Hub — Hälsobladet",
  description: "Translation dashboard for advertorials and listicles",
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is authenticated (for layout purposes)
  let user: { email?: string } | null = null;
  try {
    const supabase = await createAuthServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Not authenticated or cookies not available
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen bg-gray-50">
          {user ? (
            <>
              <Sidebar userEmail={user.email} />
              <main className="flex-1 overflow-auto">{children}</main>
            </>
          ) : (
            <main className="flex-1">{children}</main>
          )}
        <Toaster position="top-right" />
        <AgentationWrapper />
      </body>
    </html>
  );
}
