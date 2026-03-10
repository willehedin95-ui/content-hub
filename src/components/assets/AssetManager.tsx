"use client";

import { useState } from "react";
import type { Asset, Product } from "@/types";
import AssetsSidebar, { type AssetView } from "./AssetsSidebar";
import AssetGrid from "./AssetGrid";
import UrlImportModal from "./UrlImportModal";

interface Props {
  initialAssets: Asset[];
}

export default function AssetManager({ initialAssets }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeView, setActiveView] = useState<AssetView>("images");
  const [activeProduct, setActiveProduct] = useState<Product | "all" | "general">("all");
  const [urlImportOpen, setUrlImportOpen] = useState(false);

  const counts = {
    images: assets.filter((a) => a.media_type === "image").length,
    videos: assets.filter((a) => a.media_type === "video").length,
  };

  const filteredAssets = assets.filter((a) => {
    if (activeProduct === "all") return true;
    if (activeProduct === "general") return a.product === null;
    return a.product === activeProduct;
  });

  function handleAssetCreated(asset: Asset) {
    setAssets([asset, ...assets]);
  }

  return (
    <>
      <div className="flex h-[calc(100vh-64px)]">
        <AssetsSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          activeProduct={activeProduct}
          onProductChange={setActiveProduct}
          counts={counts}
        />
        <div className="flex-1 overflow-y-auto p-6">
          {activeView === "images" && (
            <AssetGrid
              assets={filteredAssets}
              mediaType="image"
              onAssetsChange={setAssets}
              onOpenUrlImport={() => setUrlImportOpen(true)}
              activeProduct={activeProduct}
            />
          )}
          {activeView === "videos" && (
            <AssetGrid
              assets={filteredAssets}
              mediaType="video"
              onAssetsChange={setAssets}
              onOpenUrlImport={() => setUrlImportOpen(true)}
              activeProduct={activeProduct}
            />
          )}
          {activeView === "swipe-image" && (
            <div className="text-gray-400 text-center py-20">
              Image Swiper — coming soon
            </div>
          )}
          {activeView === "swipe-video" && (
            <div className="text-gray-400 text-center py-20">
              Video Swiper — coming soon
            </div>
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
