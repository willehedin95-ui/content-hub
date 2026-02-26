"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Image, BookOpen, FileSearch, Users } from "lucide-react";
import type {
  ProductFull,
  ProductImage,
  CopywritingGuideline,
  ReferencePage,
  ProductSegment,
} from "@/types";
import ProductInfoTab from "./ProductInfoTab";
import ProductImageManager from "./ProductImageManager";
import GuidelinesEditor from "./GuidelinesEditor";
import ReferencePagesManager from "./ReferencePagesManager";
import SegmentEditor from "./SegmentEditor";

const TABS = [
  { id: "info", label: "Info", icon: FileText },
  { id: "images", label: "Images", icon: Image },
  { id: "segments", label: "Segments", icon: Users },
  { id: "guidelines", label: "Guidelines", icon: BookOpen },
  { id: "references", label: "Reference Pages", icon: FileSearch },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  initialProduct: ProductFull & {
    product_images: ProductImage[];
    copywriting_guidelines: CopywritingGuideline[];
    reference_pages: ReferencePage[];
    product_segments: ProductSegment[];
  };
}

export default function ProductDetail({ initialProduct }: Props) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [activeTab, setActiveTab] = useState<TabId>("info");

  function handleProductUpdate(updated: Partial<ProductFull>) {
    setProduct((prev) => ({ ...prev, ...updated }));
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/products")}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-400 font-mono">{product.slug}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <ProductInfoTab
          product={product}
          onUpdate={handleProductUpdate}
        />
      )}

      {activeTab === "images" && (
        <ProductImageManager
          productId={product.id}
          images={product.product_images}
          onImagesChange={(images) =>
            setProduct((prev) => ({ ...prev, product_images: images }))
          }
        />
      )}

      {activeTab === "segments" && (
        <SegmentEditor
          productId={product.id}
          segments={product.product_segments ?? []}
          onSegmentsChange={(segments) =>
            setProduct((prev) => ({ ...prev, product_segments: segments }))
          }
        />
      )}

      {activeTab === "guidelines" && (
        <GuidelinesEditor
          productId={product.id}
          guidelines={product.copywriting_guidelines}
          onGuidelinesChange={(guidelines) =>
            setProduct((prev) => ({ ...prev, copywriting_guidelines: guidelines }))
          }
        />
      )}

      {activeTab === "references" && (
        <ReferencePagesManager
          productId={product.id}
          references={product.reference_pages}
          onReferencesChange={(references) =>
            setProduct((prev) => ({ ...prev, reference_pages: references }))
          }
        />
      )}
    </div>
  );
}
