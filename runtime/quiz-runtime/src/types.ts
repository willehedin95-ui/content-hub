// Shared types between runtime and host page (mirrors src/types/quiz.ts)

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export type QuestionOption = {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  value?: string;
};

export type SubEl =
  | { id: string; kind: "title"; text: string; isRichText: true; contentFormat: "html" }
  | { id: string; kind: "text"; text: string; isRichText: true; contentFormat: "html" }
  | {
      id: string;
      kind: "question";
      kindOf: "single" | "multi";
      layout: "list" | "cards" | "image_cards";
      options: QuestionOption[];
    }
  | { id: string; kind: "image"; url: string; alt: string }
  | { id: string; kind: "custom_html"; html: string }
  | { id: string; kind: "loading"; text: string; style: string; seconds: number };

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

export type QuizConfig = {
  apiBaseUrl: string;
  quizId: string;
};

export type UTMParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

export type QuizEvent = {
  event_type: "step_view" | "answer" | "email_capture" | "back" | "exit_click" | "abandon";
  step_id?: string;
  variant_group_id?: string;
  option_id?: string;
  meta?: Record<string, unknown>;
  ts: number;
};

// Globals injected by the HTML shell
declare global {
  interface Window {
    __QUIZ_DATA__: QuizData;
    __QUIZ_SETTINGS__: QuizSettings;
    __QUIZ_CONFIG__: QuizConfig;
    fbq?: (...args: unknown[]) => void;
  }
}
