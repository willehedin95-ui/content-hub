"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImportPageModal from "./ImportPageModal";
import PagesTable from "./PagesTable";
import { Page } from "@/types";

export type TestRecord = { wins: number; losses: number; active: number };

export default function DashboardClient({ pages, testRecords }: { pages: Page[]; testRecords?: Record<string, TestRecord> }) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Landing pages
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and translate your advertorials & listicles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/swiper")}>
            <Wand2 className="w-4 h-4" />
            Swipe & Rewrite
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <PlusCircle className="w-4 h-4" />
            Import New Page
          </Button>
        </div>
      </div>

      <PagesTable pages={pages} onImport={() => setImportOpen(true)} testRecords={testRecords} />

      <ImportPageModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
