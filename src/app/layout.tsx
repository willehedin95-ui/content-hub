import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { createAuthServerClient } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Content Hub — Hälsobladet",
  description: "Translation dashboard for advertorials and listicles",
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
        <ToastProvider>
          {user ? (
            <>
              <Sidebar userEmail={user.email} />
              <main className="flex-1 overflow-auto">{children}</main>
            </>
          ) : (
            <main className="flex-1">{children}</main>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
