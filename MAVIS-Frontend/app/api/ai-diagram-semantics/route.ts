import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { CompactFlowAiContext, SequenceAiEnrichment } from "@/features/architecture/scenario-design";
import type { C4AiDiagramEnrichment, CompactC4AiContext } from "@/features/architecture/diagram-projections";
import type { CompactUmlAiContext, UmlAiDiagramEnrichment } from "@/features/architecture/uml-diagrams";
import type { ThreeEAiPromptContext, ThreeEAiSimplifiedExplanation } from "@/features/architecture/three-e-content";

export const dynamic = "force-dynamic";

// shortcut: in-memory Map cache (up to 500 views), upgrade to Redis/Postgres if multi-instance
const enrichmentCache = new Map<string, SequenceAiEnrichment>();
const c4EnrichmentCache = new Map<string, C4AiDiagramEnrichment>();
const umlEnrichmentCache = new Map<string, UmlAiDiagramEnrichment>();
const threeEEnrichmentCache = new Map<string, ThreeEAiSimplifiedExplanation>();

function resolveAiKey(): { key: string; provider: "openai" | "gemini" } | null {
  const envOpenAi = process.env["OPENAI_API_KEY"]?.trim();
  if (envOpenAi) return { key: envOpenAi, provider: "openai" };

  const envMavis = process.env["MAVIS_AI_API_KEY"]?.trim();
  if (envMavis) {
    return {
      key: envMavis,
      provider: envMavis.startsWith("sk-") ? "openai" : "gemini",
    };
  }

  const candidates = [
    path.resolve(process.cwd(), "API_KEY"),
    path.resolve(process.cwd(), "API_KEY.txt"),
    path.resolve(process.cwd(), "..", "API_KEY"),
    path.resolve(process.cwd(), "..", "API_KEY.txt"),
    path.resolve(process.cwd(), "..", "MAVIS-Platform", "mavis-be", "API_KEY"),
    path.resolve(process.cwd(), "..", "MAVIS-Platform", "mavis-be", "API_KEY.txt"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
        const val = trimmed.includes("=") ? trimmed.slice(trimmed.indexOf("=") + 1).trim() : trimmed;
        if (val.length >= 20) {
          return {
            key: val,
            provider: val.startsWith("sk-") ? "openai" : "gemini",
          };
        }
      }
    } catch {
      // ignore unreadable candidate
    }
  }
  return null;
}

const SEQUENCE_SYSTEM_PROMPT = `You are a Top-Down Microservice Business Flow & UML 2.5 Sequence Diagram Static/AST Analyzer.
Given a compact AST skeleton slice and participant call-chain of a software flow, evaluate the flow from a top-down architectural perspective and extract ONLY real business flow & control-flow semantics grounded in the code:
- flowTitle: concise top-down Business Flow name in standard Software Engineering English <= 76 chars (e.g. "Main Flow · Order Placement & CreateOrderSaga Orchestration (11 steps)" or "REST API Flow: OrderController.createOrder() → CreateOrderSaga").
- flowSummary: 1-2 sentence top-down architectural explanation in English <= 180 chars of what business use-case this flow executes from initiator to downstream services/databases.
- hasLoop: true ONLY if the AST skeleton contains an explicit loop (for, while, forEach, stream) over a collection.
- loopGuard: concise loop condition <= 32 chars (e.g. "for (OrderLineItem item : items)"), or omit if hasLoop is false.
- hasAlt: true if there is conditional branching, validation, or Saga outcome handling.
- altGuard: concise happy-path guard <= 32 chars (e.g. "orderTotal > 0" or "creditReserved == true").
- altElseGuard: "else"
- altElseLabel: concise failure/compensation action <= 36 chars (e.g. "reject(data) / noteCreditFailed()").
- hasOpt: true ONLY if there is an optional trailing domain event / notification step.
- optGuard: concise condition <= 28 chars (e.g. "creditReservedEvent").
- stepLabels: map of step index ("0", "1", ...) to concise UML call label <= 34 chars using short param names (e.g. "createOrder(orderDetails)", "save(order)", "create(createOrderSaga, data)", "reserveCredit(orderId, total)"). Do NOT inline long nested expressions.
- stepReturns: map of step index ("0", "1", ...) to concise return label <= 26 chars (e.g. "return order", "return savedOrder").
Return valid JSON only.`;

const C4_SYSTEM_PROMPT = `You are a C4 Architecture Diagram Semantic Analyzer (Simon Brown C4 standard).
Given a compact AST skeleton and node list for a C4 view (CONTEXT, CONTAINER, or COMPONENT), return concise, code-grounded semantics in JSON:
- systemDescription: (for CONTEXT) 1-sentence summary of the software system <= 105 chars.
- persons: (for CONTEXT) map of person.id -> { name: concise role <= 26 chars, description: 1-line role description <= 68 chars, actionLabel: concise arrow verb phrase <= 44 chars }.
- externals: (for CONTEXT) map of external.id -> { description: <= 68 chars, actionLabel: <= 44 chars }.
- nodeDescriptions: (for CONTAINER / COMPONENT) map of node.id -> concise 1-line business/technical responsibility <= 54 chars grounded in the AST skeleton and node name (e.g. "REST controller handling POST /orders & queries", "Orchestrates distributed credit & ticket saga", "JPA repository persisting Order aggregates").
Return valid JSON only.`;

const UML_SYSTEM_PROMPT = `You are a Top-Down Microservice Business Flow & OMG UML 2.5 Static/Behavioral Analyzer.
Given a compact AST skeleton and item list for a UML diagram (UML_CLASS, UML_PACKAGE, UML_DEPLOYMENT, UML_ACTIVITY, or UML_STATE), return ONLY code-grounded semantic and layout refinements in JSON:
- For UML_CLASS: "classifierLayout" map of CLASSIFIER id -> { tier: 0 (Controller/Handler/Entrypoint) | 1 (Application Service/Saga/Orchestrator) | 2 (Domain Entity/Value Object/Event) | 3 (Repository/Proxy/Interface), order: number (0..N left-to-right order within tier to minimize edge crossings) }, and "classRelations" map of CLASS_RELATION id -> { roleName?: concise member/role name <= 24 chars, multiplicity?: "1" | "0..1" | "0..*" | "1..*", sourceRoleName?: <= 20 chars, sourceMultiplicity?: "1" | "0..1" | "0..*" }.
- For UML_PACKAGE: return only "packageLayout" map of PACKAGE id -> { tier: 0 (Inbound/Web/API/Messaging) | 1 (Application Service/Saga/Orchestration) | 2 (Domain Model/Repository/Persistence/Shared), order: number (0..N) }. Preserve all extracted dependency directions and relation kinds. A Java/C# type import or call dependency does not prove UML PackageImport/PackageAccess namespace visibility; never turn it into import/access/merge. Omit packageEdges.
- For UML_DEPLOYMENT: "deploymentLayout" map of DEPLOY_NODE:EXECUTION_ENVIRONMENT or DEPLOY_NODE:DEVICE id -> { tier: 0 (Edge/Gateway/Admin UI) | 1 (Application Microservice) | 2 (Messaging/CDC/Coordination Infrastructure) | 3 (Database/Datastore), order: number (0..N left-to-right order within tier to minimize edge crossings) }, and "deploymentEdges" map of DEPLOY_EDGE:COMMUNICATION_PATH id -> { label: concise protocol/channel label <= 38 chars (e.g. "HTTP/REST :8080" or "Kafka/Eventuate TCP :9092"), protocol: <= 18 chars }.
- For UML_ACTIVITY: review only the supplied operation, AST and control-flow evidence. Return "flowTitle" (concise SE English title, <= 76 chars), "flowSummary" (<= 180 chars), "flowCatalogTitles" (FLOW_OPTION id -> title) and "activityNodes" (ACT_NODE:ACTION id -> { label: faithful readable action phrase in English <= 160 chars }). Preserve method names, state values and negation. Never rewrite decision labels or guard expressions; never invent branches, compensation, transaction outcomes, success/failure or ordering from static dependencies. Deployment/Compose depends_on, database initialization, CDC and coordination services are not business-flow evidence. A list of downstream calls does not prove a sequence or parallel execution. When completeness is PARTIAL or limitations indicate INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION, describe it as a suggested interaction requiring verification, never a confirmed main flow. Do not add activityEdges. Omit refinements when the AST does not support them.
- For UML_STATE: evaluate the Domain Entity / Aggregate Root lifecycle from the AST and return "flowTitle" (concise SE English Entity State Machine title <= 76 chars), "flowSummary" (1-2 sentence English explanation of this entity's state transitions triggered by Saga/Commands/Events <= 180 chars), "flowCatalogTitles" (map of STATE_TARGET_OPTION id -> concise SE English Entity State Machine title <= 76 chars), "stateLayout" map of STATE id -> { tier: 0 (INITIAL) | 1..6 (lifecycle progression stage from pending -> active/approved -> cancel/revision -> terminal) | 7 (FINAL_STATE), order: number (0..N left-to-right order within tier, placing happy-path states on the left and rejection/cancellation on the right) }, "stateNodes" map of STATE:STATE id -> { entryBehavior?: <= 34 chars, doActivity?: <= 34 chars, exitBehavior?: <= 34 chars }, and "stateTransitions" map of TRANSITION id -> { trigger?: concise event/method <= 30 chars, guard?: <= 26 chars, effect?: concise action <= 34 chars }.
Return valid JSON only.`;

const THREE_E_SYSTEM_PROMPT = `You are a Senior Software Architecture 3E (Explain · Explore · Evaluate) Analyst for Microservices systems.
Given the selected architectural element or relationship and its extracted source code snippets (codeSnippets), return a clear, concise JSON explanation in standard Software Engineering English:
- explainSimple: (2-3 concise sentences) Explain the architectural responsibility of this item in the business flow, its upstream callers, and its downstream dependencies.
- exploreSimple: (1-2 sentences) Summarize what the extracted source code evidence below implements (citing key classes/files).
- evaluateSimple: (1-2 sentences) Evaluate coupling, architectural trade-offs, or operational risks (e.g. Saga compensation, synchronous HTTP latency, shared database coupling, or clean separation of concerns).
- snippetNotes: object mapping each codeSnippet id to a 1-sentence English explanation of what that specific code snippet proves.
Return valid JSON only.`;

const THREE_E_CHAT_SYSTEM_PROMPT = `You are an interactive 3E (Explain · Explore · Evaluate) Software Architecture AI Assistant.
The user is inspecting an architectural element or relationship and asking a follow-up question to clarify its behavior, code evidence, or design trade-offs.
Based on the 3E context (title, type, inboundPeers, outboundPeers, childComponents, extracted codeSnippets, current 3E summary) and chat history:
- Answer in clear, concise Software Engineering English (2-4 sentences), directly addressing the question with concrete references to classes, methods, files, or services in codeSnippets.
- If the question asks about details not present in the extracted snippets, state what is verified in the code and point to the related component to inspect next.
Return valid JSON only: { "answer": "concise English explanation" }`;

async function callStructuredLlm<T>(
  resolved: { key: string; provider: "openai" | "gemini" },
  systemPrompt: string,
  userPayload: string,
): Promise<Partial<T> | null> {
  if (resolved.provider === "openai") {
    const endpoint =
      process.env["OPENAI_BASE_URL"]?.trim() || "https://api.openai.com/v1/chat/completions";
    const modelName = process.env["OPENAI_MODEL"]?.trim() || "gpt-5-mini";
    const isReasoningModel = /^(?:gpt-5|o1|o3|o4)/i.test(modelName);
    const requestBody: Record<string, unknown> = {
      model: modelName,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
      ],
    };
    if (!isReasoningModel) {
      requestBody["temperature"] = 0.1;
    } else if (/^gpt-5/i.test(modelName)) {
      requestBody["reasoning_effort"] = "minimal";
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.key}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return JSON.parse(content) as Partial<T>;
    }
    return null;
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${resolved.key}`;
  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPayload}` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (content) return JSON.parse(content) as Partial<T>;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      context?: CompactFlowAiContext;
      fallback?: SequenceAiEnrichment;
      c4Context?: CompactC4AiContext;
      umlContext?: CompactUmlAiContext;
      threeEContext?: ThreeEAiPromptContext;
      threeEFallback?: ThreeEAiSimplifiedExplanation;
      threeEChat?: {
        threeEContext: ThreeEAiPromptContext;
        currentExplanation?: {
          explainSimple?: string;
          exploreSimple?: string;
          evaluateSimple?: string;
        };
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        question: string;
      };
    };

    // Branch -2: Interactive 3E Follow-up Q&A Chat
    if (body.threeEChat && body.threeEChat.question?.trim()) {
      const { threeEContext: tCtx, currentExplanation, history = [], question } = body.threeEChat;
      const q = question.trim();
      const buildFallbackAnswer = (): string => {
        const files = tCtx.codeSnippets.map((s) => s.locator).filter(Boolean);
        const inbound = tCtx.inboundPeers.slice(0, 4).join(", ");
        const outbound = tCtx.outboundPeers.slice(0, 4).join(", ");
        const children = tCtx.childComponents.slice(0, 5).join(", ");
        const parts: string[] = [
          `Regarding "${tCtx.title}" (${tCtx.type}): ${currentExplanation?.explainSimple || tCtx.summary}`,
        ];
        if (inbound || outbound) {
          parts.push(
            `Dependency flow: ${inbound ? `invoked by [${inbound}]` : "acts as an inbound entrypoint"}${
              outbound ? ` and calls [${outbound}]` : ""
            }.`,
          );
        }
        if (children) {
          parts.push(`Contained components: ${children}.`);
        }
        if (files.length > 0) {
          parts.push(`Source code evidence is located at: ${files.slice(0, 3).join(", ")}.`);
        }
        return parts.join(" ");
      };

      const resolved = resolveAiKey();
      if (!resolved) {
        return NextResponse.json({
          answer: buildFallbackAnswer(),
          provider: "ast-skeleton",
        });
      }

      const parsedChat = await callStructuredLlm<{ answer?: string }>(
        resolved,
        THREE_E_CHAT_SYSTEM_PROMPT,
        JSON.stringify({
          target: {
            title: tCtx.title,
            type: tCtx.type,
            elementType: tCtx.elementType,
            inboundPeers: tCtx.inboundPeers,
            outboundPeers: tCtx.outboundPeers,
            childComponents: tCtx.childComponents,
            findingsSummary: tCtx.findingsSummary,
            codeSnippets: tCtx.codeSnippets,
          },
          currentExplanation,
          history: history.slice(-6),
          userQuestion: q,
        }),
      );

      const answer =
        typeof parsedChat?.answer === "string" && parsedChat.answer.trim()
          ? parsedChat.answer.trim()
          : buildFallbackAnswer();

      return NextResponse.json({
        answer,
        provider: parsedChat?.answer ? resolved.provider : "ast-skeleton",
      });
    }

    // Branch -1: 3E Simplified AI Explanation + Per-Snippet Code Notes
    if (body.threeEContext && body.threeEContext.contextHash) {
      const tCtx = body.threeEContext;
      const fallback3E: ThreeEAiSimplifiedExplanation = body.threeEFallback ?? {
        explainSimple: tCtx.summary,
        exploreSimple: `Extracted ${tCtx.codeSnippets.length} source code evidence snippets.`,
        evaluateSimple: tCtx.findingsSummary[0] ?? "Current coupling and structural boundaries conform to standard architectural guidelines.",
      };
      const hit = threeEEnrichmentCache.get(tCtx.contextHash);
      if (hit) {
        return NextResponse.json({ threeEEnrichment: hit, cached: true });
      }
      const resolved = resolveAiKey();
      if (!resolved) {
        return NextResponse.json({
          threeEEnrichment: {
            ...fallback3E,
            tokenStats: {
              rawChars: tCtx.rawChars,
              compressedChars: tCtx.compressedChars,
              savedPercent: tCtx.savedPercent,
              provider: "ast-skeleton",
            },
          },
          cached: false,
        });
      }
      const userPayload = JSON.stringify({
        title: tCtx.title,
        type: tCtx.type,
        elementType: tCtx.elementType,
        inboundPeers: tCtx.inboundPeers,
        outboundPeers: tCtx.outboundPeers,
        childComponents: tCtx.childComponents,
        findingsSummary: tCtx.findingsSummary,
        codeSnippets: tCtx.codeSnippets,
      });
      const parsed3E = await callStructuredLlm<ThreeEAiSimplifiedExplanation>(
        resolved,
        THREE_E_SYSTEM_PROMPT,
        userPayload,
      );
      const merged3E: ThreeEAiSimplifiedExplanation = {
        explainSimple:
          typeof parsed3E?.explainSimple === "string" && parsed3E.explainSimple.trim()
            ? parsed3E.explainSimple.trim()
            : fallback3E.explainSimple,
        exploreSimple:
          typeof parsed3E?.exploreSimple === "string" && parsed3E.exploreSimple.trim()
            ? parsed3E.exploreSimple.trim()
            : fallback3E.exploreSimple,
        evaluateSimple:
          typeof parsed3E?.evaluateSimple === "string" && parsed3E.evaluateSimple.trim()
            ? parsed3E.evaluateSimple.trim()
            : fallback3E.evaluateSimple,
        snippetNotes: {
          ...(fallback3E.snippetNotes ?? {}),
          ...(parsed3E?.snippetNotes && typeof parsed3E.snippetNotes === "object"
            ? parsed3E.snippetNotes
            : {}),
        },
        tokenStats: {
          rawChars: tCtx.rawChars,
          compressedChars: tCtx.compressedChars,
          savedPercent: tCtx.savedPercent,
          provider: parsed3E ? resolved.provider : "ast-skeleton",
        },
      };
      if (threeEEnrichmentCache.size >= 500) {
        const oldest = threeEEnrichmentCache.keys().next().value;
        if (oldest) threeEEnrichmentCache.delete(oldest);
      }
      threeEEnrichmentCache.set(tCtx.contextHash, merged3E);
      return NextResponse.json({ threeEEnrichment: merged3E, cached: false });
    }

    // Branch 0: UML Diagram Enrichment (Class / Package / Deployment / Activity / State)
    if (body.umlContext && body.umlContext.contextHash) {
      const umlCtx = body.umlContext;
      const hit = umlEnrichmentCache.get(umlCtx.contextHash);
      if (hit) {
        return NextResponse.json({ umlEnrichment: hit, cached: true });
      }
      const resolved = resolveAiKey();
      if (!resolved) {
        return NextResponse.json({ umlEnrichment: {}, cached: false });
      }
      const userPayload = JSON.stringify({
        diagramKind: umlCtx.diagramKind,
        scopeSummary: umlCtx.scopeSummary,
        items: umlCtx.items,
        astSkeleton: umlCtx.astSkeleton,
      });
      const parsedUml = await callStructuredLlm<UmlAiDiagramEnrichment>(
        resolved,
        UML_SYSTEM_PROMPT,
        userPayload,
      );
      const mergedUml: UmlAiDiagramEnrichment = {
        ...(parsedUml?.classifierLayout && typeof parsedUml.classifierLayout === "object"
          ? { classifierLayout: parsedUml.classifierLayout }
          : {}),
        ...(parsedUml?.classRelations && typeof parsedUml.classRelations === "object"
          ? { classRelations: parsedUml.classRelations }
          : {}),
        ...(parsedUml?.packageLayout && typeof parsedUml.packageLayout === "object"
          ? { packageLayout: parsedUml.packageLayout }
          : {}),
        ...(parsedUml?.packageEdges && typeof parsedUml.packageEdges === "object"
          ? { packageEdges: parsedUml.packageEdges }
          : {}),
        ...(parsedUml?.deploymentLayout && typeof parsedUml.deploymentLayout === "object"
          ? { deploymentLayout: parsedUml.deploymentLayout }
          : {}),
        ...(parsedUml?.deploymentEdges && typeof parsedUml.deploymentEdges === "object"
          ? { deploymentEdges: parsedUml.deploymentEdges }
          : {}),
        ...(parsedUml?.activityNodes && typeof parsedUml.activityNodes === "object"
          ? { activityNodes: parsedUml.activityNodes }
          : {}),
        ...(parsedUml?.activityEdges && typeof parsedUml.activityEdges === "object"
          ? { activityEdges: parsedUml.activityEdges }
          : {}),
        ...(parsedUml?.stateLayout && typeof parsedUml.stateLayout === "object"
          ? { stateLayout: parsedUml.stateLayout }
          : {}),
        ...(parsedUml?.stateNodes && typeof parsedUml.stateNodes === "object"
          ? { stateNodes: parsedUml.stateNodes }
          : {}),
        ...(parsedUml?.stateTransitions && typeof parsedUml.stateTransitions === "object"
          ? { stateTransitions: parsedUml.stateTransitions }
          : {}),
        ...(typeof parsedUml?.flowTitle === "string" && parsedUml.flowTitle.trim()
          ? { flowTitle: parsedUml.flowTitle.trim() }
          : {}),
        ...(typeof parsedUml?.flowSummary === "string" && parsedUml.flowSummary.trim()
          ? { flowSummary: parsedUml.flowSummary.trim() }
          : {}),
        ...(parsedUml?.flowCatalogTitles && typeof parsedUml.flowCatalogTitles === "object"
          ? { flowCatalogTitles: parsedUml.flowCatalogTitles }
          : {}),
        tokenStats: {
          rawChars: umlCtx.rawChars,
          compressedChars: umlCtx.compressedChars,
          savedPercent: umlCtx.savedPercent,
          provider: parsedUml ? resolved.provider : "ast-skeleton",
        },
      };
      if (umlEnrichmentCache.size >= 500) {
        const oldest = umlEnrichmentCache.keys().next().value;
        if (oldest) umlEnrichmentCache.delete(oldest);
      }
      umlEnrichmentCache.set(umlCtx.contextHash, mergedUml);
      return NextResponse.json({ umlEnrichment: mergedUml, cached: false });
    }

    // Branch 1: C4 Diagram Enrichment (System Context / Container / Component)
    if (body.c4Context && body.c4Context.contextHash) {
      const c4Ctx = body.c4Context;
      const hit = c4EnrichmentCache.get(c4Ctx.contextHash);
      if (hit) {
        return NextResponse.json({ c4Enrichment: hit, cached: true });
      }
      const resolved = resolveAiKey();
      if (!resolved) {
        return NextResponse.json({ c4Enrichment: {}, cached: false });
      }
      const userPayload = JSON.stringify({
        kind: c4Ctx.kind,
        systemName: c4Ctx.systemName,
        nodes: c4Ctx.nodes,
        persons: c4Ctx.persons,
        externals: c4Ctx.externals,
        astSkeleton: c4Ctx.astSkeleton,
      });
      const parsedC4 = await callStructuredLlm<C4AiDiagramEnrichment>(
        resolved,
        C4_SYSTEM_PROMPT,
        userPayload,
      );
      const mergedC4: C4AiDiagramEnrichment = {
        ...(typeof parsedC4?.systemDescription === "string"
          ? { systemDescription: parsedC4.systemDescription }
          : {}),
        ...(parsedC4?.persons && typeof parsedC4.persons === "object"
          ? { persons: parsedC4.persons }
          : {}),
        ...(parsedC4?.externals && typeof parsedC4.externals === "object"
          ? { externals: parsedC4.externals }
          : {}),
        ...(parsedC4?.nodeDescriptions && typeof parsedC4.nodeDescriptions === "object"
          ? { nodeDescriptions: parsedC4.nodeDescriptions }
          : {}),
        tokenStats: {
          rawChars: c4Ctx.rawChars,
          compressedChars: c4Ctx.compressedChars,
          savedPercent: c4Ctx.savedPercent,
          provider: parsedC4 ? resolved.provider : "ast-skeleton",
        },
      };
      if (c4EnrichmentCache.size >= 500) {
        const oldest = c4EnrichmentCache.keys().next().value;
        if (oldest) c4EnrichmentCache.delete(oldest);
      }
      c4EnrichmentCache.set(c4Ctx.contextHash, mergedC4);
      return NextResponse.json({ c4Enrichment: mergedC4, cached: false });
    }

    // Branch 2: Sequence Diagram Enrichment
    const ctx = body.context;
    const fallback: SequenceAiEnrichment = body.fallback ?? {};
    if (!ctx || !ctx.contextHash) {
      return NextResponse.json({ enrichment: fallback, cached: false });
    }

    const hit = enrichmentCache.get(ctx.contextHash);
    if (hit) {
      return NextResponse.json({ enrichment: hit, cached: true });
    }

    const resolved = resolveAiKey();
    if (!resolved) {
      return NextResponse.json({ enrichment: fallback, cached: false });
    }

    const userPayload = JSON.stringify({
      flow: ctx.title,
      level: ctx.level,
      steps: ctx.steps,
      astSkeleton: ctx.astSkeleton,
    });

    const parsedAi = await callStructuredLlm<SequenceAiEnrichment>(
      resolved,
      SEQUENCE_SYSTEM_PROMPT,
      userPayload,
    );

    const merged: SequenceAiEnrichment = {
      ...fallback,
      ...(parsedAi
        ? {
            flowTitle:
              typeof parsedAi.flowTitle === "string" && parsedAi.flowTitle.trim()
                ? parsedAi.flowTitle.trim()
                : fallback.flowTitle,
            flowSummary:
              typeof parsedAi.flowSummary === "string" && parsedAi.flowSummary.trim()
                ? parsedAi.flowSummary.trim()
                : fallback.flowSummary,
            hasLoop: typeof parsedAi.hasLoop === "boolean" ? parsedAi.hasLoop : fallback.hasLoop,
            loopGuard:
              typeof parsedAi.loopGuard === "string" && parsedAi.loopGuard.trim()
                ? parsedAi.loopGuard.trim()
                : fallback.loopGuard,
            hasAlt: typeof parsedAi.hasAlt === "boolean" ? parsedAi.hasAlt : fallback.hasAlt,
            altGuard:
              typeof parsedAi.altGuard === "string" && parsedAi.altGuard.trim()
                ? parsedAi.altGuard.trim()
                : fallback.altGuard,
            altElseGuard:
              typeof parsedAi.altElseGuard === "string" && parsedAi.altElseGuard.trim()
                ? parsedAi.altElseGuard.trim()
                : fallback.altElseGuard,
            altElseLabel:
              typeof parsedAi.altElseLabel === "string" && parsedAi.altElseLabel.trim()
                ? parsedAi.altElseLabel.trim()
                : fallback.altElseLabel,
            hasOpt: typeof parsedAi.hasOpt === "boolean" ? parsedAi.hasOpt : fallback.hasOpt,
            optGuard:
              typeof parsedAi.optGuard === "string" && parsedAi.optGuard.trim()
                ? parsedAi.optGuard.trim()
                : fallback.optGuard,
            stepLabels:
              parsedAi.stepLabels && typeof parsedAi.stepLabels === "object"
                ? parsedAi.stepLabels
                : fallback.stepLabels,
            stepReturns:
              parsedAi.stepReturns && typeof parsedAi.stepReturns === "object"
                ? parsedAi.stepReturns
                : fallback.stepReturns,
          }
        : {}),
      tokenStats: {
        rawChars: ctx.rawChars,
        compressedChars: ctx.compressedChars,
        savedPercent: ctx.savedPercent,
        provider: parsedAi ? resolved.provider : "ast-skeleton",
      },
    };

    if (enrichmentCache.size >= 500) {
      const oldestKey = enrichmentCache.keys().next().value;
      if (oldestKey) enrichmentCache.delete(oldestKey);
    }
    enrichmentCache.set(ctx.contextHash, merged);

    return NextResponse.json({ enrichment: merged, cached: false });
  } catch {
    return NextResponse.json({ enrichment: {}, c4Enrichment: {}, cached: false });
  }
}
