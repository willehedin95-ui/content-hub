"use client";

import { ImageJob, MetaCampaign, MetaCampaignMapping, MetaPageConfig, ConceptCopyTranslations } from "@/types";
import MetaAdPreview from "./MetaAdPreview";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ConceptPreviewStepProps {
  job: ImageJob;
  copyTranslations: ConceptCopyTranslations;
  metaPush: {
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    landingPageIdB: string;
    pushing: boolean;
    pushResults: Array<{ language: string; country: string; status: string; error?: string; scheduled_time?: string }> | null;
  };
  deployments: MetaCampaign[];
  previewData: {
    landingPageUrls: Record<string, string>;
    campaignMappings: MetaCampaignMapping[];
    pageConfigs: MetaPageConfig[];
  } | null;
  onPushToMeta: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConceptPreviewStep({
  job,
  copyTranslations,
  metaPush,
  deployments,
  previewData,
  onPushToMeta,
}: ConceptPreviewStepProps) {
  return (
    <MetaAdPreview
      job={job}
      copyTranslations={copyTranslations}
      metaPush={metaPush}
      deployments={deployments}
      onPushToMeta={onPushToMeta}
      landingPageUrls={previewData?.landingPageUrls ?? {}}
      campaignMappings={previewData?.campaignMappings ?? []}
      pageConfigs={previewData?.pageConfigs ?? []}
    />
  );
}
