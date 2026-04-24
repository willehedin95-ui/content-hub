/** @jsxImportSource preact */
import { h } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import type {
  QuizData,
  QuizSettings,
  QuizConfig,
  StepNode,
  ExitNode,
  QuizNode,
} from "./types";
import {
  resolveVariants,
  resolveNextNode,
  findStartNode,
  extractUTM,
  EventBuffer,
  detectDeviceType,
} from "./state";
import { startSession, flushEvents, subscribeKlaviyo } from "./api";
import { StepRenderer, ProgressBar } from "./renderer";
import { topoOrderSteps } from "./topo";
import { t } from "./i18n";

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

function firePixelEvent(eventName: string, params: Record<string, unknown>) {
  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params);
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type AppProps = {
  data: QuizData;
  settings: QuizSettings;
  config: QuizConfig;
};

export function App({ data, settings, config }: AppProps) {
  const [currentNode, setCurrentNode] = useState<QuizNode | null>(null);
  const [history, setHistory] = useState<QuizNode[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [variantAssignments, setVariantAssignments] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [previewToast, setPreviewToast] = useState<string | null>(null);
  const bufferRef = useRef<EventBuffer | null>(null);
  const sessionInitialized = useRef(false);

  // Auto-dismiss preview toast after 4s
  useEffect(() => {
    if (!previewToast) return;
    const t = setTimeout(() => setPreviewToast(null), 4000);
    return () => clearTimeout(t);
  }, [previewToast]);

  // Compute ordered steps for progress tracking (do once)
  const orderedSteps = topoOrderSteps(data);
  const totalSteps = orderedSteps.length;

  // Initialize: resolve variants, start session, fire PageView pixel
  useEffect(() => {
    if (sessionInitialized.current) return;
    sessionInitialized.current = true;

    const assignments = resolveVariants(data, config.quizId);
    setVariantAssignments(assignments);

    // Find start node and navigate to first step
    const startNode = findStartNode(data);
    if (!startNode) {
      console.error("[quiz-runtime] No start node found");
      return;
    }

    const firstNode = resolveNextNode(data, startNode.id, null, null, assignments);
    setCurrentNode(firstNode);

    // Fire PageView pixel immediately (skip in preview)
    if (!config.preview && settings.providers.metaPixel?.pixelId) {
      firePixelEvent("PageView", {});
    }

    // In preview mode skip all API calls - just render
    if (config.preview) return;

    // Start session async (don't block render)
    const utm = extractUTM();
    void startSession(
      config.apiBaseUrl,
      config.quizId,
      assignments,
      utm,
      data.id ?? "",
    )
      .then((sid) => {
        setSessionId(sid);
        bufferRef.current = new EventBuffer(sid, (sId, evts) =>
          flushEvents(config.apiBaseUrl, sId, evts),
        );
        // Log first step view
        if (firstNode && firstNode.kind === "step") {
          bufferRef.current.push({
            event_type: "step_view",
            step_id: firstNode.id,
            variant_group_id: firstNode.variantGroupId,
          });
        }
      })
      .catch((err) => {
        console.warn("[quiz-runtime] session start failed:", err);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup buffer on unmount
  useEffect(() => () => bufferRef.current?.destroy(), []);

  // Defensive auto-advance: if we ever land on a step with no subEls
  // (e.g. persisted data from before pruneEmptySteps was introduced),
  // immediately skip to the next node without adding to history.
  useEffect(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const step = currentNode as StepNode;
    if (step.subEls.length === 0) {
      const next = resolveNextNode(data, step.id, null, null, variantAssignments);
      if (next && next.id !== currentNode.id) {
        navigateTo(next, false);
      }
    }
  }, [currentNode]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = useCallback(
    (node: QuizNode, addToHistory = true) => {
      if (addToHistory && currentNode) {
        setHistory((h) => [...h, currentNode]);
      }
      setCurrentNode(node);

      // Update step index for progress bar
      if (node.kind === "step") {
        const idx = orderedSteps.findIndex((s) => s.id === node.id);
        if (idx >= 0) setStepIndex(idx);

        if (!config.preview) {
          bufferRef.current?.push({
            event_type: "step_view",
            step_id: node.id,
            variant_group_id: node.variantGroupId,
          });
        }
      }
    },
    [currentNode, orderedSteps, config.preview],
  );

  const handleAnswer = useCallback(
    (questionElId: string, optionId: string) => {
      if (!currentNode || currentNode.kind !== "step") return;

      if (!config.preview) {
        bufferRef.current?.push({
          event_type: "answer",
          step_id: currentNode.id,
          variant_group_id: currentNode.variantGroupId,
          option_id: optionId,
          meta: { questionElId },
        });
      }

      const next = resolveNextNode(
        data,
        currentNode.id,
        optionId,
        questionElId,
        variantAssignments,
      );
      if (next) navigateTo(next);
    },
    [currentNode, data, variantAssignments, navigateTo],
  );

  const handleLoadingComplete = useCallback(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const next = resolveNextNode(
      data,
      currentNode.id,
      null,
      null,
      variantAssignments,
    );
    if (next) navigateTo(next);
  }, [currentNode, data, variantAssignments, navigateTo]);

  const handleContinue = useCallback(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const next = resolveNextNode(
      data,
      currentNode.id,
      null,
      null,
      variantAssignments,
    );
    if (next) navigateTo(next);
  }, [currentNode, data, variantAssignments, navigateTo]);

  const handleEmailSubmit = useCallback(
    async (email: string) => {
      if (!config.preview) {
        bufferRef.current?.push({
          event_type: "email_capture",
          step_id: currentNode?.kind === "step" ? currentNode.id : undefined,
          meta: { email },
        });

        // Fire Lead pixel event
        if (settings.providers.metaPixel?.pixelId) {
          firePixelEvent("Lead", { content_name: settings.metadata.title, value: 0 });
        }

        // Subscribe to Klaviyo
        if (settings.providers.klaviyo?.listId && sessionId) {
          try {
            await subscribeKlaviyo(
              config.apiBaseUrl,
              sessionId,
              email,
              settings.providers.klaviyo.listId,
            );
          } catch (err) {
            console.warn("[quiz-runtime] Klaviyo subscribe failed:", err);
          }
        }
      }

      // Advance to next node
      if (currentNode && currentNode.kind === "step") {
        const next = resolveNextNode(
          data,
          currentNode.id,
          null,
          null,
          variantAssignments,
        );
        if (next) navigateTo(next);
      }
    },
    [currentNode, data, variantAssignments, navigateTo, sessionId, settings, config],
  );

  const handleBack = useCallback(() => {
    if (!config.preview) {
      bufferRef.current?.push({
        event_type: "back",
        step_id: currentNode?.kind === "step" ? currentNode.id : undefined,
      });
    }
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      const rest = h.slice(0, -1);
      setCurrentNode(prev);
      if (prev.kind === "step") {
        const idx = orderedSteps.findIndex((s) => s.id === prev.id);
        if (idx >= 0) setStepIndex(idx);
      }
      return rest;
    });
  }, [currentNode, orderedSteps]);

  const handleExitClick = useCallback(
    (exitNode: ExitNode) => {
      if (config.preview) {
        // In preview mode surface the target as an inline toast instead of
        // hijacking window.title via a native alert.
        const redirectBase = exitNode.redirectUrl || settings.redirectUrl || "(no redirect URL)";
        setPreviewToast(`[Preview] Would redirect to: ${redirectBase}`);
        return;
      }

      bufferRef.current?.push({ event_type: "exit_click" });

      // Fire CompleteRegistration pixel
      if (settings.providers.metaPixel?.pixelId) {
        firePixelEvent("CompleteRegistration", {
          content_name: settings.metadata.title,
          value: 0,
        });
      }

      // Flush events before redirect
      void bufferRef.current?.flush().finally(() => {
        // Build redirect URL with UTM
        const redirectBase =
          exitNode.redirectUrl || settings.redirectUrl || "";
        const url = new URL(redirectBase, location.href);
        url.searchParams.set("utm_source", "quiz");
        url.searchParams.set("utm_campaign", document.title || "quiz");
        if (sessionId) url.searchParams.set("utm_content", sessionId);
        location.href = url.toString();
      });
    },
    [settings, sessionId, config.preview],
  );

  // Render exit node as a CTA screen
  if (currentNode?.kind === "exit") {
    const exitNode = currentNode as ExitNode;
    return (
      <div class="quiz-shell">
        <div class="quiz-content quiz-exit">
          <p class="quiz-text">{t("loadingResults", config.market)}</p>
          <button
            class="quiz-btn quiz-btn--primary"
            type="button"
            onClick={() => handleExitClick(exitNode)}
          >
            {t("seeResults", config.market)}
          </button>
        </div>
        {previewToast && <div class="quiz-preview-toast">{previewToast}</div>}
      </div>
    );
  }

  if (!currentNode || currentNode.kind !== "step") {
    return (
      <div class="quiz-shell">
        <div class="quiz-content">
          <div class="quiz-loading">
            <div class="quiz-loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  const stepNode = currentNode as StepNode;
  const canGoBack = settings.backNavigation && history.length > 0;
  const captureStepId = settings.providers.klaviyo?.captureAtStepId;

  return (
    <div class="quiz-shell">
      <div class="quiz-header">
        {canGoBack && (
          <button class="quiz-back-btn" type="button" onClick={handleBack} aria-label="Go back">
            &larr;
          </button>
        )}
        {settings.brandLogo?.enabled && settings.brandLogo.url && (
          <img src={settings.brandLogo.url} alt="Logo" class="quiz-logo" />
        )}
        {settings.stepProgressCount && (
          <span class="quiz-step-count">
            {stepIndex + 1} / {totalSteps}
          </span>
        )}
      </div>

      {settings.progressBar && (
        <ProgressBar current={stepIndex + 1} total={totalSteps} />
      )}

      <div class="quiz-content">
        <StepRenderer
          node={stepNode}
          onAnswer={handleAnswer}
          onLoadingComplete={handleLoadingComplete}
          onEmailSubmit={handleEmailSubmit}
          captureAtStepId={captureStepId}
          market={config.market}
          onContinue={handleContinue}
        />
      </div>
    </div>
  );
}

// Suppress unused import warning - Fragment is needed for JSX compilation
void h;
