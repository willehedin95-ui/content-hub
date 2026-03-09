"use client";

import { BuilderProvider, useBuilder, type BuilderProps } from "./BuilderContext";
import BuilderTopBar from "./BuilderTopBar";
import BuilderCanvas from "./BuilderCanvas";
import BuilderStatusBar from "./BuilderStatusBar";
import LeftSidebar from "./left-sidebar/LeftSidebar";
import RightPanel from "./right-panel/RightPanel";
import QualityPanel from "./QualityPanel";
import PublishModal from "@/components/pages/PublishModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";

function BuilderShellInner() {
  const {
    showPublishModal,
    setShowPublishModal,
    confirmAction,
    setConfirmAction,
    showQualityDetails,
    translation,
    router,
    pageId,
  } = useBuilder();

  return (
    <div className="flex flex-col h-full">
      <BuilderTopBar />
      {showQualityDetails && <QualityPanel />}
      <div className="flex flex-1 min-h-0">
        <LeftSidebar />
        <BuilderCanvas />
        <RightPanel />
      </div>
      <BuilderStatusBar />

      {/* Publish progress modal */}
      <PublishModal
        open={showPublishModal}
        translationId={translation.id}
        onClose={(published) => {
          setShowPublishModal(false);
          if (published) {
            router.push(`/pages/${pageId}`);
            router.refresh();
          }
        }}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel="Continue"
        variant={confirmAction?.variant ?? "default"}
        onConfirm={() => confirmAction?.action()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

export default function BuilderShell(props: BuilderProps) {
  return (
    <BuilderProvider {...props}>
      <BuilderShellInner />
    </BuilderProvider>
  );
}
