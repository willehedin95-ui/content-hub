"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImportPageModal from "./ImportPageModal";
import PagesTable from "./PagesTable";
import { Page } from "@/types";

export default function DashboardClient({ pages }: { pages: Page[] }) {
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
        <Button onClick={() => setImportOpen(true)}>
          <PlusCircle className="w-4 h-4" />
          Import New Page
        </Button>
      </div>

      <PagesTable pages={pages} onImport={() => setImportOpen(true)} />

      <ImportPageModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
