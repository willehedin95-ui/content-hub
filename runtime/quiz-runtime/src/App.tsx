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
import { startSessionWithRetry, flushEvents, subscribeKlaviyo } from "./api";
import { StepRenderer, ProgressBar, OfferTimerBar } from "./renderer";
import { topoOrderSteps } from "./topo";
import { t } from "./i18n";

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

/**
 * Fires the exit redirect on mount. Used by the exit-node screen so users
 * don't have to click an extra button - the loading splash transitions
 * straight to the destination URL.
 */
function ExitAutoRedirect({
  node,
  onTrigger,
}: {
  node: ExitNode;
  onTrigger: (n: ExitNode) => void;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onTrigger(node);
  }, [node, onTrigger]);
  return null;
}

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
  // Iframe-driven modal active state (commit-gates inuti bload skickar
  // postMessage 'quiz-modal-open'/'quiz-modal-close'). När true renderar vi
  // en page-level backdrop som täcker hela viewporten - iframens egna lokala
  // overlay räckte inte eftersom den bara dimmar iframens area, inte page-
  // headern och content runt iframen (William 2026-05-04).
  const [modalActive, setModalActive] = useState(false);
  // User answers keyed by variable name; used for {varName} interpolation in
  // downstream title/text content.
  const [variables, setVariables] = useState<Record<string, string>>({});
  const bufferRef = useRef<EventBuffer | null>(null);
  // Mirror of sessionId readable at redirect time without stale-closure risk:
  // the exit redirect builds its URL inside async callbacks, and the session
  // may resolve (via retry) between click and redirect.
  const sessionIdRef = useRef<string | null>(null);
  const sessionInitialized = useRef(false);

  // Auto-dismiss preview toast after 4s
  useEffect(() => {
    if (!previewToast) return;
    const t = setTimeout(() => setPreviewToast(null), 4000);
    return () => clearTimeout(t);
  }, [previewToast]);

  // Mobile keyboard handling: track on-screen keyboard height via VisualViewport
  // API and expose as --quiz-keyboard-inset CSS var. Used by .quiz-continue-wrap
  // to push fixed-bottom CTA above keyboard on text_input/dropdown steps so user
  // can submit without dismissing keyboard first (William 2026-05-03).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty(
        "--quiz-keyboard-inset",
        `${inset}px`,
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Compute ordered steps for progress tracking (do once). A variant group
  // counts as ONE logical step - a visitor only ever passes one sibling per
  // group, so counting siblings individually made the header show e.g.
  // "27" when the user actually sees 25 steps.
  const orderedSteps = topoOrderSteps(data);
  const seenVariantGroups = new Set<string>();
  const logicalSteps = orderedSteps.filter((s) => {
    if (!s.variantGroupId) return true;
    if (seenVariantGroups.has(s.variantGroupId)) return false;
    seenVariantGroups.add(s.variantGroupId);
    return true;
  });
  const totalSteps = logicalSteps.length;
  /** Index of a step in the deduped logical order (variant siblings map to
   *  their group's single slot). -1 when not found. */
  const logicalStepIndex = (node: StepNode): number =>
    logicalSteps.findIndex((s) =>
      node.variantGroupId
        ? s.variantGroupId === node.variantGroupId
        : s.id === node.id,
    );

  // Initialize: resolve variants, start session, fire PageView pixel
  useEffect(() => {
    if (sessionInitialized.current) return;
    sessionInitialized.current = true;

    // Optional URL-override for variant testing: ?variant=A|B
    // Maps "A" / "B" / "0" / "1" to the first/second step in each variant
    // group (in node-order). Or pass `?variant=<stepId>` for an exact pick.
    // Also cleans the localStorage cache so the override takes effect now.
    try {
      const params = new URLSearchParams(location.search);
      const variantParam = params.get("variant");
      if (variantParam) {
        const groups: Record<string, string[]> = {};
        for (const node of Object.values(data.nodes)) {
          if (node.kind !== "step" || !node.variantGroupId) continue;
          if (!groups[node.variantGroupId]) groups[node.variantGroupId] = [];
          groups[node.variantGroupId].push(node.id);
        }
        const v = variantParam.toUpperCase();
        for (const [groupId, members] of Object.entries(groups)) {
          let pickedId: string | null = null;
          if (v === "A" || v === "0") pickedId = members[0];
          else if (v === "B" || v === "1") pickedId = members[1] ?? members[0];
          else if (data.nodes[variantParam]) pickedId = variantParam; // exact step id
          if (pickedId) {
            localStorage.setItem(`quiz_${config.quizId}_vg_${groupId}`, pickedId);
          }
        }
      }
    } catch { /* swallow */ }

    const assignments = resolveVariants(data, config.quizId);
    setVariantAssignments(assignments);

    // Find start node and navigate to first step
    const startNode = findStartNode(data);
    if (!startNode) {
      console.error("[quiz-runtime] No start node found");
      return;
    }

    let firstNode = resolveNextNode(data, startNode.id, null, null, assignments, {});

    // Dev-shortcut: ?goto=<keyword> hoppar direkt till första step vars
    // node.name (case-insensitive) innehåller keyword. Förfyller också
    // typiska variabler så interpolation fungerar. Användbart för att
    // iterera på en specifik slide utan att klicka igenom hela quizet.
    // Exempel: ?goto=block+9, ?goto=profil, ?goto=loading, ?goto=offer
    try {
      const params = new URLSearchParams(location.search);
      const goto = params.get("goto");
      if (goto && goto.trim()) {
        const keyword = goto.trim().toLowerCase();
        // Prefer exact (case-insensitive) name match so test URLs can target
        // variant siblings unambiguously (e.g. "Offer page" vs "Offer page
        // (B variant)" - includes() would match both, find() returns first).
        // Fall back to includes() for partial keywords like "offer" / "block 9".
        const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
        const exactMatch = steps.find(
          (n) => (n.name ?? "").toLowerCase() === keyword,
        );
        const match =
          exactMatch ??
          steps.find((n) => (n.name ?? "").toLowerCase().includes(keyword));
        if (match) {
          firstNode = match;
          // Force variant assignment so the matched variant is what renders
          // even if localStorage has the user assigned to a sibling. Necessary
          // because resolveNode() swaps any variantGroupId node to whatever
          // variantAssignments says, so without this override the goto-target
          // is silently replaced. Persist to localStorage so the assignment
          // sticks for the rest of the session.
          if (match.kind === "step" && match.variantGroupId) {
            assignments[match.variantGroupId] = match.id;
            setVariantAssignments({ ...assignments });
            try {
              localStorage.setItem(
                `quiz_${config.quizId}_vg_${match.variantGroupId}`,
                match.id,
              );
            } catch { /* swallow */ }
          }
          // Förfyll vanliga variabler så {name}/{breed}/etc interpolerar.
          // Override per param: ?vars=name:Bella,breed:Tax
          const defaults: Record<string, string> = {
            name: "Bella",
            name_pos: "Bellas",
            gender: "Hane",
            gender_value: "han",
            breed: "Golden retriever",
            primary_pain: "Drar i kopplet",
            primary_pain_value: "koppeldragning",
            age: "7-12 månader",
            age_value: "7-12 mån",
            time_per_day: "10 min/dag",
            ignores_owner_value: "Spridd",
            seeks_affection_value: "Stark",
          };
          const varsParam = params.get("vars");
          if (varsParam) {
            varsParam.split(",").forEach((kv) => {
              const [k, v] = kv.split(":");
              if (k && v) defaults[k.trim()] = v.trim();
            });
          }
          setVariables(defaults);
          // eslint-disable-next-line no-console
          console.info(`[quiz-runtime] goto=${goto} → ${match.id} (${match.kind === "step" ? match.name : ""})`);
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[quiz-runtime] goto=${goto} no match`);
        }
      }
    } catch {
      /* ignore - fail gracefully if URL parsing breaks */
    }

    setCurrentNode(firstNode);

    // Fire PageView pixel immediately (skip in preview)
    if (!config.preview && settings.providers.metaPixel?.pixelId) {
      firePixelEvent("PageView", {});
    }

    // In preview mode skip all API calls - just render
    if (config.preview) return;

    // Create the event buffer SYNCHRONOUSLY at mount, before the session
    // exists. Events (first step_view, fast answers) buffer client-side and
    // are flushed as soon as startSession resolves - a slow or flaky session
    // start no longer costs the entire session's events.
    bufferRef.current = new EventBuffer(
      null,
      (sId, evts) => flushEvents(config.apiBaseUrl, sId, evts),
      config.apiBaseUrl,
    );
    if (firstNode && firstNode.kind === "step") {
      bufferRef.current.push({
        event_type: "step_view",
        step_id: firstNode.id,
        variant_group_id: firstNode.variantGroupId,
      });
    }

    // Start session async (don't block render). Retries with backoff
    // (1s/3s/9s) - cold-start blips on the hub no longer orphan the visit.
    const utm = extractUTM();
    void startSessionWithRetry(
      config.apiBaseUrl,
      config.quizId,
      assignments,
      utm,
      data.id ?? "",
    )
      .then((sid) => {
        setSessionId(sid);
        sessionIdRef.current = sid;
        // Attach the id + flush everything buffered since mount. The first
        // step_view lands as fast as the session API allows (Meta Pixel
        // PageView and our analytics agree on the start count).
        bufferRef.current?.setSessionId(sid);
      })
      .catch((err) => {
        console.warn("[quiz-runtime] session start failed after retries:", err);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup buffer on unmount
  useEffect(() => () => bufferRef.current?.destroy(), []);

  // PawChamp-style commit-gate steps render their own Yes/No UI inside an
  // iframe (custom_html). They postMessage `quiz-runtime-continue` to advance
  // the flow. We capture an optional `value` so analytics can still see which
  // option the user picked.
  //
  // Analytics-only events (no flow advance) use `quiz-runtime-event` so iframes
  // can fire intermediate signals (e.g. modal-1 click before the step actually
  // continues on modal-2). Schema: { type, event_type, option_id?, meta? }.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;

      // Modal toggle från iframen (commit-gate modaler i bload).
      // Page-level backdrop dimmar hela viewporten istället för bara iframens
      // area. Iframens egen lokala overlay (rgba 0,0,0,0.32) räckte inte -
      // page header + content runt iframen syntes igenom.
      if (d.type === "quiz-modal-open") {
        setModalActive(true);
        return;
      }
      if (d.type === "quiz-modal-close") {
        setModalActive(false);
        return;
      }

      // Analytics-only event (does not advance the flow)
      if (d.type === "quiz-runtime-event" && typeof d.event_type === "string") {
        if (!config.preview && currentNode && currentNode.kind === "step") {
          bufferRef.current?.push({
            event_type: d.event_type,
            step_id: currentNode.id,
            variant_group_id: currentNode.variantGroupId,
            option_id: typeof d.option_id === "string" ? d.option_id : undefined,
            meta:
              d.meta && typeof d.meta === "object" ? (d.meta as Record<string, unknown>) : undefined,
          });
          // High-intent commit-gate "yes" → fire Meta Pixel Lead. The runtime's
          // existing Lead-on-email path stays untouched; this surfaces the
          // commit-gate signal as well so audiences can be built from intent
          // even when no email is captured.
          if (
            settings.providers.metaPixel?.pixelId &&
            typeof d.option_id === "string" &&
            d.option_id.endsWith("_yes")
          ) {
            firePixelEvent("Lead", {
              content_name: settings.metadata.title,
              content_category: "commit_gate",
            });
          }
        }
        return;
      }

      if (d.type !== "quiz-runtime-continue") return;
      if (!currentNode || currentNode.kind !== "step") return;
      if (!config.preview) {
        const value = typeof d.value === "string" ? d.value : "yes";
        // Offer-page CTAs (and any future iframe CTAs) postMessage with
        // value='offer_cta_click'. Mirror that as a dedicated `cta_click`
        // event_type so funnel-CTR queries don't need to filter on option_id.
        // We keep the original `answer` event too for backward compat with
        // existing analytics queries that read it.
        if (value === "offer_cta_click") {
          bufferRef.current?.push({
            event_type: "cta_click",
            step_id: currentNode.id,
            variant_group_id: currentNode.variantGroupId,
            meta: { source: "offer_page" },
          });
        }
        bufferRef.current?.push({
          event_type: "answer",
          step_id: currentNode.id,
          variant_group_id: currentNode.variantGroupId,
          option_id: value,
          meta: { source: "commit_gate_modal" },
        });
      }
      const next = resolveNextNode(
        data,
        currentNode.id,
        null,
        null,
        variantAssignments,
        variables,
      );
      if (next) navigateTo(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentNode, data, variantAssignments, variables, config.preview, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Defensive auto-advance: if we ever land on a step with no subEls
  // (e.g. persisted data from before pruneEmptySteps was introduced),
  // immediately skip to the next node without adding to history.
  useEffect(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const step = currentNode as StepNode;
    if (step.subEls.length === 0) {
      const next = resolveNextNode(data, step.id, null, null, variantAssignments, variables);
      if (next && next.id !== currentNode.id) {
        navigateTo(next, false);
      }
    }
  }, [currentNode, variables]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = useCallback(
    (node: QuizNode, addToHistory = true) => {
      if (addToHistory && currentNode) {
        setHistory((h) => [...h, currentNode]);
      }
      setCurrentNode(node);

      // Update step index for progress bar (variant-group aware)
      if (node.kind === "step") {
        const idx = logicalStepIndex(node);
        if (idx >= 0) setStepIndex(idx);

        if (!config.preview) {
          bufferRef.current?.push({
            event_type: "step_view",
            step_id: node.id,
            variant_group_id: node.variantGroupId,
          });

          // Fire Meta Pixel InitiateCheckout when the user lands on the
          // offer page (last step before exit). Detection by step name -
          // build-quiz.py uses "Offer page" / "offer". This is the highest
          // upstream-of-purchase intent signal we have client-side.
          if (settings.providers.metaPixel?.pixelId && node.kind === "step") {
            const stepName = (node.name ?? "").toLowerCase();
            if (stepName.includes("offer")) {
              firePixelEvent("InitiateCheckout", {
                content_name: settings.metadata.title,
                content_category: "offer_page",
              });
            }
          }
        }
      }
    },
    [currentNode, orderedSteps, config.preview, settings],
  );

  const handleAnswer = useCallback(
    (questionElId: string, optionId: string) => {
      if (!currentNode || currentNode.kind !== "step") return;

      // Capture answer as variable if this question declares one
      const q = currentNode.subEls.find(
        (el) => el.id === questionElId && el.kind === "question",
      );
      if (q && q.kind === "question" && q.variable) {
        const picked = q.options.find((o) => o.id === optionId);
        if (picked) {
          // Always capture label as the primary variable. Also expose the
          // optional `value` field as `<variable>_value` so authors can
          // store derived data (e.g. label="Hane", value="han" for
          // pronoun substitution) without losing the human-readable label.
          setVariables((prev) => ({
            ...prev,
            [q.variable!]: picked.label,
            ...(picked.value !== undefined
              ? { [`${q.variable!}_value`]: picked.value }
              : {}),
          }));
        }
      }

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
        variables,
      );
      if (next) navigateTo(next);
    },
    [currentNode, data, variantAssignments, variables, navigateTo],
  );

  // Capture a free-text / numeric / range value without navigating — useful
  // for text_input / range_slider elements that don't move the flow on their
  // own (the step's Continue button handles navigation).
  const handleVariableChange = useCallback((variable: string, value: string) => {
    setVariables((prev) => ({ ...prev, [variable]: value }));
  }, []);

  const handleLoadingComplete = useCallback(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const next = resolveNextNode(
      data,
      currentNode.id,
      null,
      null,
      variantAssignments,
      variables,
    );
    if (next) navigateTo(next);
  }, [currentNode, data, variantAssignments, variables, navigateTo]);

  const handleContinue = useCallback(() => {
    if (!currentNode || currentNode.kind !== "step") return;
    const next = resolveNextNode(
      data,
      currentNode.id,
      null,
      null,
      variantAssignments,
      variables,
    );
    if (next) navigateTo(next);
  }, [currentNode, data, variantAssignments, variables, navigateTo]);

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

        // Subscribe to Klaviyo (read the session id from the ref - the
        // session may have resolved after this callback was created)
        const sid = sessionIdRef.current;
        if (settings.providers.klaviyo?.listId && sid) {
          try {
            await subscribeKlaviyo(
              config.apiBaseUrl,
              sid,
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
          variables,
        );
        if (next) navigateTo(next);
      }
    },
    [currentNode, data, variantAssignments, variables, navigateTo, sessionId, settings, config],
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
        const idx = logicalStepIndex(prev);
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

      // Build the redirect URL as a function so it can be evaluated AT
      // REDIRECT TIME: startSession retries with backoff, so the session id
      // may resolve during the flush window below. We never wait extra for
      // it - but if it exists by then, qz_sid/utm_content ride along and
      // the purchase attributes correctly instead of landing as "Direct LP".
      //
      // UTM strategy: utm_source=quiz, utm_medium=funnel, utm_campaign=<slug>,
      // utm_content=<sessionId> (links Shopify orders back to a quiz session
      // via custom-attribute capture or a Shopify webhook), utm_term=<pain>
      // (so GA4/Shopify can segment by primary problem the user reported).
      // Extra qz_* params survive even if the destination page strips utm_*.
      //
      // Heuristic: when the redirect base is a Shopify cart-permalink
      // (`/cart/<variant>:<qty>`), the quiz is going DIRECTLY to checkout.
      // In that case all attribution goes via `attributes[<key>]` syntax so
      // it lands in `order.note_attributes` for our webhook to read. For
      // any other destination (LP page, /products/...) we keep using plain
      // utm/qz query params so trackers and the existing qz-attribution.js
      // ScriptTag continue to find them.
      const buildTarget = (): string => {
        const sid = sessionIdRef.current;
        const redirectBase = exitNode.redirectUrl || settings.redirectUrl || "";
        const url = new URL(redirectBase, location.href);
        const isCartPermalink = /^\/cart\/\d+:\d+/i.test(url.pathname);
        const setParam = (key: string, value: string) => {
          if (isCartPermalink) {
            url.searchParams.set(`attributes[${key}]`, value);
          } else {
            url.searchParams.set(key, value);
          }
        };
        setParam("utm_source", "quiz");
        setParam("utm_medium", "funnel");
        setParam("utm_campaign", config.quizSlug || "quiz");
        if (sid) setParam("utm_content", sid);
        const pain = variables.primary_pain_value || variables.primary_pain;
        if (pain) setParam("utm_term", pain);
        if (sid) setParam("qz_sid", sid);
        if (pain) setParam("qz_pain", pain);
        if (variables.breed) setParam("qz_breed", variables.breed);
        if (variables.time_per_day) setParam("qz_time", variables.time_per_day);
        if (variables.age) setParam("qz_age", variables.age);
        return url.toString();
      };

      // Race the flush against a 1.5s timeout - if events can't reach the hub
      // (CORS error, blocked network, slow API) we still redirect on time.
      // We never wait indefinitely for the session id.
      const flushPromise = bufferRef.current?.flush().catch(() => {}) ?? Promise.resolve();
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1500));
      void Promise.race([flushPromise, timeoutPromise]).finally(() => {
        location.href = buildTarget();
      });
    },
    [settings, sessionId, config.preview, config.quizSlug, variables],
  );

  // Render exit node as an auto-redirecting "loading" splash. The previous
  // pattern (loading text + a "See my results" button) confused users - the
  // text said it was loading but nothing happened until they clicked. Now we
  // fire handleExitClick on mount and just show the spinner while flush +
  // redirect resolve. handleExitClick already races the flush against a
  // 1.5s timeout so the redirect is always prompt.
  if (currentNode?.kind === "exit") {
    const exitNode = currentNode as ExitNode;
    const redirectBase = exitNode.redirectUrl || settings.redirectUrl || "";
    let isCartPermalink = false;
    try {
      const url = new URL(redirectBase, location.href);
      isCartPermalink = /^\/cart\/\d+:\d+/i.test(url.pathname);
    } catch {
      /* fall through to default copy */
    }
    const loadingLabel = isCartPermalink
      ? t("loadingCheckout", config.market)
      : t("loadingResults", config.market);
    return (
      <div class="quiz-shell">
        <div class="quiz-content quiz-exit">
          <ExitAutoRedirect node={exitNode} onTrigger={handleExitClick} />
          <div class="quiz-loading-spinner" />
          <p class="quiz-text">{loadingLabel}</p>
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

  // 2026-05-04 v3: splittade tillbaka från merged "Profil + Offer".
  // Profil-sidan = hero + stat-card + chart (edge-to-edge). Offer-sidan =
  // sticky timer-banner + product intro + Marie + ... + FAQ.
  const isProfilStep = !!stepNode.name && /Block 24 - Profil/i.test(stepNode.name);
  const isOfferStep = !!stepNode.name && /^Offer page/i.test(stepNode.name);

  const shellClasses = [
    "quiz-shell",
    modalActive && "modal-active",
    isProfilStep && "profil-step",
    isOfferStep && "offer-step",
  ].filter(Boolean).join(" ");

  return (
    <div class={shellClasses}>
      <div class="quiz-header">
        <div class="quiz-header-side quiz-header-side--start">
          {canGoBack && (
            <button class="quiz-back-btn" type="button" onClick={handleBack} aria-label="Go back">
              &larr;
            </button>
          )}
        </div>
        {settings.brandLogo?.enabled && settings.brandLogo.url && (
          <img src={settings.brandLogo.url} alt="Logo" class="quiz-logo" />
        )}
        <div class="quiz-header-side quiz-header-side--end">
          {settings.stepProgressCount && (
            <span class="quiz-step-count">
              {stepIndex + 1} / {totalSteps}
            </span>
          )}
        </div>
      </div>

      {settings.progressBar && !isProfilStep && !isOfferStep && (
        <ProgressBar current={stepIndex + 1} total={totalSteps} />
      )}

      {/* Offer-timer renderas i parent-DOM ovanför .quiz-content endast
       * på offer-steget. Sticky:top:0 funkar mot parent-page-scroll.
       * (William 2026-05-04 v3)
       *
       * Variant-undantag: A/B-variants av offer page får INTE auto-injicera
       * parent-timer-baren. Tanken är att varianten själv bestämmer sin
       * urgency-strategi (t.ex. ingen timer alls, eller en egen
       * today+2-deadline). Match: namn med "(B variant)" / "(variant)" /
       * "(B)" etc. Original "Offer page" behåller timern. */}
      {isOfferStep && !/\(.*variant.*\)/i.test(stepNode.name ?? "") && (
        <OfferTimerBar />
      )}

      <div class="quiz-content">
        <StepRenderer
          key={stepNode.id}
          node={stepNode}
          onAnswer={handleAnswer}
          onLoadingComplete={handleLoadingComplete}
          onEmailSubmit={handleEmailSubmit}
          captureAtStepId={captureStepId}
          market={config.market}
          onContinue={handleContinue}
          variables={variables}
          onVariableChange={handleVariableChange}
        />
      </div>
    </div>
  );
}

// Suppress unused import warning - Fragment is needed for JSX compilation
void h;
