import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { Toaster } from "@/components/ui/sonner";
import AgentationWrapper from "@/components/ui/AgentationWrapper";
import { createAuthServerClient } from "@/lib/supabase-server";
import { getAllWorkspaces, getWorkspaceSlug } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Content Hub",
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

  // Load workspaces for the sidebar switcher
  const workspaces = user ? await getAllWorkspaces() : [];
  const activeWorkspaceSlug = user ? await getWorkspaceSlug() : undefined;
  const activeWs = workspaces.find((w) => w.slug === activeWorkspaceSlug);

  return (
    <html lang="en">
      <body className="flex min-h-screen bg-gray-50">
          {user ? (
            <WorkspaceProvider activeLanguages={activeWs?.languages ?? []} slug={activeWs?.slug ?? "happysleep"}>
              <Sidebar userEmail={user.email} workspaces={workspaces} activeWorkspaceSlug={activeWorkspaceSlug} />
              <main className="flex-1 overflow-auto">{children}</main>
            </WorkspaceProvider>
          ) : (
            <main className="flex-1">{children}</main>
          )}
        <Toaster position="top-right" />
        <AgentationWrapper />
      </body>
    </html>
  );
}
