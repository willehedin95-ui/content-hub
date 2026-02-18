import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Content Hub — Hälsobladet",
  description: "Translation dashboard for advertorials and listicles",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-gray-50">
        <ToastProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
