// src/types/quiz.ts
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export type StartNode = { id: string; kind: "start"; size: Size; position: Point };
export type StepNode = {
  id: string;
  kind: "step";
  name: string;
  size: Size;
  position: Point;
  rotation: number;
  subEls: SubEl[];
  variantGroupId?: string;
  trafficPct?: number;
};
export type ExitNode = {
  id: string;
  kind: "exit";
  name: string;
  size: Size;
  position: Point;
  redirectUrl: string;
};
export type QuizNode = StartNode | StepNode | ExitNode;

export type RouteCondition =
  | { kind: "default" }
  | { kind: "option"; questionElId: string; optionId: string };

export type QuizEdge = { id: string; from: string; to: string; condition?: RouteCondition };

export type QuestionOption = {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  /**
   * Author-facing placeholder when the importer (Gemini video extractor)
   * could see that the source quiz had an illustration per option but
   * couldn't download it. Rendered as a dashed placeholder until the user
   * drops in a real image.
   */
  imageDescription?: string;
  value?: string;
};

export type SubEl =
  | { id: string; kind: "title"; text: string; isRichText: true; contentFormat: "html" }
  | { id: string; kind: "text"; text: string; isRichText: true; contentFormat: "html" }
  | {
      id: string;
      kind: "question";
      kindOf: "single" | "multi";
      layout: "list" | "cards" | "image_cards" | "dropdown";
      options: QuestionOption[];
      variable?: string;
      searchable?: boolean;
      dropdownPlaceholder?: string;
    }
  | {
      id: string;
      kind: "text_input";
      variable: string;
      placeholder?: string;
      inputType?: "text" | "number" | "date";
      min?: number;
      max?: number;
    }
  | {
      id: string;
      kind: "range_slider";
      variable: string;
      min: number;
      max: number;
      step?: number;
      initial?: number;
      unit?: string;
    }
  | {
      id: string;
      kind: "testimonial_slider";
      items: { name: string; text: string; avatar?: string; rating?: number }[];
    }
  | { id: string; kind: "image"; url: string; alt: string }
  | { id: string; kind: "custom_html"; html: string }
  | { id: string; kind: "loading"; text: string; style: string; seconds: number };

export type QuizData = {
  id: string;
  nodes: Record<string, QuizNode>;
  edges: Record<string, QuizEdge>;
  camera: { x: number; y: number; z: number };
};

export type QuizSettings = {
  brandLogo?: { url: string; enabled: boolean };
  brandColors: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    primaryBrand: string;
    optionBackground: string;
  };
  fontSettings: { enabled: boolean; fontFamily: string };
  progressBar: boolean;
  stepProgressCount: boolean;
  backNavigation: boolean;
  metadata: { title: string; description: string; ogImage?: string; favicon?: string };
  providers: {
    klaviyo?: { listId: string; captureAtStepId?: string };
    metaPixel?: { pixelId: string };
    ga4?: { measurementId: string };
  };
  redirectUrl: string;
  customCode?: { head?: string; bodyEnd?: string };
};

export type QuizRow = {
  id: string;
  workspace_id: string;
  market: "se" | "dk" | "no";
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  data: QuizData;
  settings: QuizSettings;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
