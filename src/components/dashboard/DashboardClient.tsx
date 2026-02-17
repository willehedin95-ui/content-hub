"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import ImportPageModal from "./ImportPageModal";
import PagesTable from "./PagesTable";
import { Page } from "@/types";

export default function DashboardClient({ pages }: { pages: Page[] }) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Landing pages</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage and translate your advertorials & listicles
          </p>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Import New Page
        </button>
      </div>

      <PagesTable pages={pages} onImport={() => setImportOpen(true)} />

      <ImportPageModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
