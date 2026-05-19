"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Asset } from "@/types";
import AssetsSidebar, { type AssetView } from "./AssetsSidebar";
import AssetGrid from "./AssetGrid";
import UrlImportModal from "./UrlImportModal";
import VideoSwiper from "./VideoSwiper";
import ImageSwiper from "./ImageSwiper";
import BeforeAfterGenerator from "./BeforeAfterGenerator";
import PostProductionStandalone from "./PostProductionStandalone";

const VALID_VIEWS: AssetView[] = ["images", "videos", "swipe-image", "swipe-video", "before-after", "post-production"];

interface Props {
  initialAssets: Asset[];
}

function AssetManagerInner({ initialAssets }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialView = searchParams.get("view") as AssetView | null;
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeView, setActiveView] = useState<AssetView>(
    initialView && VALID_VIEWS.includes(initialView) ? initialView : "images"
  );
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  /** When set, the Post Production view loads with this asset preselected.
   *  Wired up by AssetGrid's "Edit (Post Production)" button in the
   *  preview modal so user can jump from browsing into editing. */
  const [postProdAsset, setPostProdAsset] = useState<Asset | null>(null);

  const handleViewChange = useCallback((view: AssetView) => {
    setActiveView(view);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/assets?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleEditPostProd = useCallback((asset: Asset) => {
    setPostProdAsset(asset);
    handleViewChange("post-production");
  }, [handleViewChange]);

  const counts = {
    images: assets.filter((a) => a.media_type === "image").length,
    videos: assets.filter((a) => a.media_type === "video").length,
  };

  function handleAssetCreated(asset: Asset) {
    setAssets([asset, ...assets]);
  }

  return (
    <>
      <div className="flex h-[calc(100vh-64px)]">
        <AssetsSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          counts={counts}
        />
        <div className="flex-1 overflow-y-auto p-6">
          {activeView === "images" && (
            <AssetGrid
              assets={assets}
              mediaType="image"
              onAssetsChange={setAssets}
              onOpenUrlImport={() => setUrlImportOpen(true)}
              activeProduct="all"
              onEditPostProd={handleEditPostProd}
            />
          )}
          {activeView === "videos" && (
            <AssetGrid
              assets={assets}
              mediaType="video"
              onAssetsChange={setAssets}
              onOpenUrlImport={() => setUrlImportOpen(true)}
              activeProduct="all"
            />
          )}
          {activeView === "swipe-image" && (
            <ImageSwiper onAssetCreated={(asset) => setAssets(prev => [asset, ...prev])} />
          )}
          {activeView === "swipe-video" && (
            <VideoSwiper />
          )}
          {activeView === "before-after" && (
            <BeforeAfterGenerator
              onAssetCreated={(asset) => setAssets(prev => [asset, ...prev])}
              defaultProduct={null}
            />
          )}
          {activeView === "post-production" && (
            <PostProductionStandalone
              assets={assets}
              onAssetsChange={setAssets}
              preselectedAsset={postProdAsset}
              onConsumePreselectedAsset={() => setPostProdAsset(null)}
            />
          )}
        </div>
      </div>
      <UrlImportModal
        open={urlImportOpen}
        onClose={() => setUrlImportOpen(false)}
        onAssetCreated={handleAssetCreated}
        defaultMediaType={activeView === "videos" ? "video" : "image"}
      />
    </>
  );
}

export default function AssetManager({ initialAssets }: Props) {
  return (
    <Suspense fallback={null}>
      <AssetManagerInner initialAssets={initialAssets} />
    </Suspense>
  );
}
