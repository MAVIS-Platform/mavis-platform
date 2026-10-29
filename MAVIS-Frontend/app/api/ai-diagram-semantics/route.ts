import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { reportAiUsage } from "@/lib/ai/usage-report";
import { currentSession } from "@/lib/api/java-operations";
import { literalSourceContext, normalizeThreeE, normalizeC4 } from "@/lib/ai/evidence-grounding";
import type { CompactFlowAiContext, SequenceAiEnrichment } from "@/features/architecture/scenario-design";
import type { C4AiDiagramEnrichment, CompactC4AiContext } from "@/features/architecture/diagram-projections";
import type { CompactUmlAiContext, UmlAiDiagramEnrichment } from "@/features/architecture/uml-diagrams";
import {
  checkThreeEScopeGuardrail,
  type ThreeEAiPromptContext,
  type ThreeEAiSimplifiedExplanation,
} from "@/features/architecture/three-e-content";

export const dynamic = "force-dynamic";

// shortcut: in-memory Map cache (up to 500 views), upgrade to Redis/Postgres if multi-instance
const enrichmentCache = new Map<string, SequenceAiEnrichment>();
const c4EnrichmentCache = new Map<string, C4AiDiagramEnrichment>();
const umlEnrichmentCache = new Map<string, UmlAiDiagramEnrichment>();
const threeEEnrichmentCache = new Map<string, ThreeEAiSimplifiedExplanation>();
const threeEChatCache = new Map<string, string>();

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

const C4_SYSTEM_PROMPT = `You annotate a C4 diagram using a partial source AST, not the entire repository.
Return JSON only: { "nodeDescriptions": { "supplied-node-id": "concise description up to 54 characters" } }.
Only annotate nodes with hasSourceEvidence=true, and only describe what the supplied AST supports.
Never infer people, human roles, business purpose, database persistence or runtime behavior from names.
Startup links, configured endpoints, discovery and tracing are not business HTTP calls.
Do not add or rename actors, nodes, edges or the software system. Omit descriptions that cannot be supported.`;

const UML_SYSTEM_PROMPT = `You are a Top-Down Microservice Business Flow & OMG UML 2.5 Static/Behavioral Analyzer.
Given a compact AST skeleton and item list for a UML diagram (UML_CLASS, UML_PACKAGE, UML_DEPLOYMENT, UML_ACTIVITY, or UML_STATE), return ONLY code-grounded semantic and layout refinements in JSON:
- For UML_CLASS: "classifierLayout" map of CLASSIFIER id -> { tier: 0 (Controller/Handler/Entrypoint) | 1 (Application Service/Saga/Orchestrator) | 2 (Domain Entity/Value Object/Event) | 3 (Repository/Proxy/Interface), order: number (0..N left-to-right order within tier to minimize edge crossings) }, and "classRelations" map of CLASS_RELATION id -> { roleName?: concise member/role name <= 24 chars, multiplicity?: "1" | "0..1" | "0..*" | "1..*", sourceRoleName?: <= 20 chars, sourceMultiplicity?: "1" | "0..1" | "0..*" }.
- For UML_PACKAGE: return only "packageLayout" map of PACKAGE id -> { tier: 0 (Inbound/Web/API/Messaging) | 1 (Application Service/Saga/Orchestration) | 2 (Domain Model/Repository/Persistence/Shared), order: number (0..N) }. Preserve all extracted dependency directions and relation kinds. A Java/C# type import or call dependency does not prove UML PackageImport/PackageAccess namespace visibility; never turn it into import/access/merge. Omit packageEdges.
- For UML_DEPLOYMENT: "deploymentLayout" map of DEPLOY_NODE:EXECUTION_ENVIRONMENT or DEPLOY_NODE:DEVICE id -> { tier: 0 (Edge/Gateway/Admin UI) | 1 (Application Microservice) | 2 (Messaging/CDC/Coordination Infrastructure) | 3 (Database/Datastore), order: number (0..N left-to-right order within tier to minimize edge crossings) }, and "deploymentEdges" map of DEPLOY_EDGE:COMMUNICATION_PATH id -> { label: concise protocol/channel label <= 38 chars (e.g. "HTTP/REST :8080" or "Kafka/Eventuate TCP :9092"), protocol: <= 18 chars }.
- For UML_ACTIVITY: review only the supplied operation, AST and control-flow evidence. Return "flowTitle" (concise SE English title, <= 76 chars), "flowSummary" (<= 180 chars), "flowCatalogTitles" (FLOW_OPTION id -> title) and "activityNodes" (ACT_NODE:ACTION id -> { label: faithful readable action phrase in English <= 160 chars }). Preserve method names, state values and negation. Never rewrite decision labels or guard expressions; never invent branches, compensation, transaction outcomes, success/failure or ordering from static dependencies. Deployment/Compose depends_on, database initialization, CDC and coordination services are not business-flow evidence. A list of downstream calls does not prove a sequence or parallel execution. When completeness is PARTIAL or limitations indicate INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION, describe it as a suggested interaction requiring verification, never a confirmed main flow. Do not add activityEdges. Omit refinements when the AST does not support them.
- For UML_STATE: evaluate the Domain Entity / Aggregate Root lifecycle from the AST and return "flowTitle" (concise SE English Entity State Machine title <= 76 chars), "flowSummary" (1-2 sentence English explanation of this entity's state transitions triggered by Saga/Commands/Events <= 180 chars), "flowCatalogTitles" (map of STATE_TARGET_OPTION id -> concise SE English Entity State Machine title <= 76 chars), "stateLayout" map of STATE id -> { tier: 0 (INITIAL) | 1..6 (lifecycle progression stage from pending -> active/approved -> cancel/revision -> terminal) | 7 (FINAL_STATE), order: number (0..N left-to-right order within tier, placing happy-path states on the left and rejection/cancellation on the right) }, "stateNodes" map of STATE:STATE id -> { entryBehavior?: <= 34 chars, doActivity?: <= 34 chars, exitBehavior?: <= 34 chars }, and "stateTransitions" map of TRANSITION id -> { trigger?: concise event/method <= 30 chars, guard?: <= 26 chars, effect?: concise action <= 34 chars }.
Return valid JSON only.`;

const THREE_E_SYSTEM_PROMPT = `EVIDENCE POLICY: The payload is a partial selection, not the entire repository. Names, AST/model reconstructions and dependency counts do not prove behavior. Distinguish configuration/startup/discovery/tracing from business calls. Describe only what literal snippets support; do not invent validation, persistence, transactions, execution order, user roles or runtime traffic. Return assumptions (unverified inferences) and unknowns as separate string arrays. When no evidence supports a claim say unknown. Snippet notes may reference only supplied IDs.
You are a Senior Software Architecture 3E (Explain · Explore · Evaluate) Analyst for Microservices systems.
Given the selected architectural element or relationship and its extracted source code snippets (codeSnippets), return a clear, concise JSON explanation in standard Software Engineering English:
- explainSimple: State the model classification and only the role supported by supplied snippets. Say unknown for unestablished business purpose, caller identity or runtime behavior.
- exploreSimple: (1-2 sentences) Summarize what the extracted source code evidence below implements (citing key classes/files).
- evaluateSimple: Describe risks only as conditional possibilities supported by the snippets or recorded findings. Missing findings do not prove correctness, low coupling or operational safety.
- snippetNotes: Map supplied snippet IDs only to what that snippet declares; preserve dependency kinds and do not invent validation, persistence or execution order.
- assumptions: string array of explicitly unverified inferences; empty when unsupported.
- unknowns: string array of missing facts that prevent stronger conclusions.
Return valid JSON only.`;

const THREE_E_CHAT_SYSTEM_PROMPT = `EVIDENCE POLICY: Only the supplied source snippets are evidence, and they are partial. Prior explanations and chat history are not evidence; do not repeat unsupported claims from them. Clearly label inferences as unverified and missing facts as unknown. Do not infer business behavior, human actors or runtime calls from names, deployment links or configuration alone.
You are a strictly-scoped 3E (Explain · Explore · Evaluate) Software Architecture AI Assistant.
STRICT SCOPE GUARDRAIL:
1. You are strictly locked to the currently selected architectural element/relationship (target.title, target.type), its direct inboundPeers/outboundPeers, its childComponents, and its codeSnippets.
2. NEVER answer off-topic questions (food, weather, daily life, entertainment, general coding tasks, trivia) or questions about unrelated services outside target.title's direct architectural scope.
3. If userQuestion is unrelated to the software architecture, code evidence, dependencies, or design risks of target.title, DO NOT answer the question. Instead, return { "offTopic": true, "answer": "<1-sentence refusal in English stating you only answer questions about target.title's architecture and code evidence>" }.
4. For valid in-scope questions, respond in English regardless of the language of userQuestion. Use 2-4 concise sentences, citing concrete classes, files, methods, or peers from the provided context.
Return valid JSON only: { "answer": "concise response", "offTopic": false }`;

async function callStructuredLlm<T>(
  resolved: { key: string; provider: "openai" | "gemini" },
  userId: string,
  systemPrompt: string,
  userPayload: string,
  maxTokens?: number,
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
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
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
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      await reportAiUsage("openai", modelName, data.usage?.prompt_tokens, data.usage?.completion_tokens, userId);
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return safeParseLlmJson<T>(content);
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
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const outputTokens = typeof data.usageMetadata?.candidatesTokenCount === "number"
      ? data.usageMetadata.candidatesTokenCount + (data.usageMetadata.thoughtsTokenCount ?? 0)
      : undefined;
    await reportAiUsage("gemini", "gemini-2.5-flash", data.usageMetadata?.promptTokenCount, outputTokens, userId);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (content) return safeParseLlmJson<T>(content);
  }
  return null;
}

function safeParseLlmJson<T>(raw: string): Partial<T> | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    return JSON.parse(cleaned) as Partial<T>;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const fail = (status: number) => NextResponse.json(
    { error: "Request unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  const originHeader = request.headers.get("origin");
  if (!originHeader || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403);
  }
  try {
    const originUrl = new URL(originHeader);
    const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    const expectedHost = forwardedHost.split(",")[0]?.trim().replace(/:\d+$/, "");
    if (!expectedHost || (originUrl.hostname !== expectedHost && originUrl.host !== forwardedHost)) {
      return fail(403);
    }
  } catch {
    return fail(403);
  }
  const token = request.cookies.get("mavis_session")?.value;
  if (!token) return fail(401);
  let userId: string;
  try {
    const session = await currentSession(token, request.signal);
    if (!session.user) return fail(401);
    userId = session.user.id;
  } catch {
    return fail(503);
  }
  try {
    const body = (await request.json()) as {
      context?: CompactFlowAiContext;
      fallback?: SequenceAiEnrichment;
      c4Context?: CompactC4AiContext;
      umlContext?: CompactUmlAiContext;
      threeEContext?: ThreeEAiPromptContext;
      threeEFallback?: ThreeEAiSimplifiedExplanation;
      locale?: "en" | "vi";
      threeEChat?: {
        threeEContext: ThreeEAiPromptContext;
        currentExplanation?: {
          explainSimple?: string;
          exploreSimple?: string;
          evaluateSimple?: string;
        };
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        question: string;
        locale?: "en" | "vi";
      };
    };
    const locale = body.locale === "vi" || body.threeEChat?.locale === "vi" ? "vi" : "en";

    // Branch -2: Interactive 3E Follow-up Q&A Chat
    if (body.threeEChat && body.threeEChat.question?.trim()) {
      const { threeEContext: rawChatContext, currentExplanation, history = [], question } = body.threeEChat;
      const tCtx = literalSourceContext(rawChatContext);
      const q = question.trim();

      // Layer 1: Zero-token deterministic scope guardrail before any LLM API call
      const guard = checkThreeEScopeGuardrail(q, tCtx);
      if (!guard.allowed) {
        return NextResponse.json({
          answer: guard.refusalMessage,
          provider: "scope-guardrail",
          blocked: true,
        });
      }

      const chatCacheKey = `evidence-v3-${locale}:${tCtx.contextHash}::${q.toLowerCase()}`;
      const cachedAnswer = threeEChatCache.get(chatCacheKey);
      if (cachedAnswer) {
        return NextResponse.json({
          answer: cachedAnswer,
          provider: "cache",
          cached: true,
        });
      }

      const buildFallbackAnswer = (): string => {
        const files = tCtx.codeSnippets.map((s) => s.locator).filter(Boolean);
        const inbound = tCtx.inboundPeers.slice(0, 4).join(", ");
        const outbound = tCtx.outboundPeers.slice(0, 4).join(", ");
        const children = tCtx.childComponents.slice(0, 5).join(", ");
        if (locale === "vi") {
          const parts: string[] = [
            `Về "${tCtx.title}" (${tCtx.type}): ${currentExplanation?.explainSimple || tCtx.summary}`,
          ];
          if (inbound || outbound) {
            parts.push(
              `Các kết nối mô hình đã khai báo: ${inbound ? `kết nối đến [${inbound}]` : "không ghi nhận đối tác gọi đến"}${
                outbound ? ` và gọi ra [${outbound}]` : ""
              }.`,
            );
          }
          if (children) {
            parts.push(`Các component bên trong: ${children}.`);
          }
          if (files.length > 0) {
            parts.push(`Bằng chứng mã nguồn đặt tại: ${files.slice(0, 3).join(", ")}.`);
          }
          return parts.join(" ");
        }
        const parts: string[] = [
          `Regarding "${tCtx.title}" (${tCtx.type}): ${currentExplanation?.explainSimple || tCtx.summary}`,
        ];
        if (inbound || outbound) {
          parts.push(
            `Declared model connections: ${inbound ? `incoming [${inbound}]` : "no incoming peers recorded"}${
              outbound ? ` and outgoing [${outbound}]` : ""
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

      const resolved = tCtx.codeSnippets.length ? resolveAiKey() : null;
      if (!resolved || !tCtx.codeSnippets.length) {
        return NextResponse.json({
          answer: tCtx.codeSnippets.length
            ? buildFallbackAnswer()
            : (locale === "vi"
                ? "Chưa có đoạn mã nguồn nào được lưu cho phần tử này. Chỉ dựa vào mô hình thì chưa thể xác định được hành vi thực thi hay vai trò nghiệp vụ."
                : "No saved source snippets are available for this selection. The model alone cannot establish its implementation behavior or business role."),
          provider: "ast-skeleton",
        });
      }

      const chatSystemPrompt =
        locale === "vi"
          ? THREE_E_CHAT_SYSTEM_PROMPT +
            `\n\nIMPORTANT LANGUAGE INSTRUCTION: Return all explanation text in clear, natural Vietnamese Software Engineering terminology, while keeping class names, method names, service names, and file paths unchanged. Return valid JSON only: { "answer": "...", "offTopic": false }`
          : THREE_E_CHAT_SYSTEM_PROMPT;

      const parsedChat = await callStructuredLlm<{ answer?: string; offTopic?: boolean }>(
        resolved,
        userId,
        chatSystemPrompt,
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
          history: history.slice(-4),
          userQuestion: q,
        }),
        1024,
      );

      const answer =
        typeof parsedChat?.answer === "string" && parsedChat.answer.trim()
          ? parsedChat.answer.trim()
          : buildFallbackAnswer();

      if (parsedChat?.answer) {
        if (threeEChatCache.size >= 500) {
          const oldest = threeEChatCache.keys().next().value;
          if (oldest) threeEChatCache.delete(oldest);
        }
        threeEChatCache.set(chatCacheKey, answer);
      }

      return NextResponse.json({
        answer,
        provider: parsedChat?.answer ? resolved.provider : "ast-skeleton",
      });
    }

    // Branch -1: 3E Simplified AI Explanation + Per-Snippet Code Notes
    if (body.threeEContext && body.threeEContext.contextHash) {
      const tCtx = literalSourceContext(body.threeEContext);
      const fallback3E = normalizeThreeE(null, tCtx);
      const cacheKey = `evidence-v2:${locale}:${tCtx.contextHash}`;
      const hit = threeEEnrichmentCache.get(cacheKey);
      if (hit) {
        return NextResponse.json({ threeEEnrichment: hit, cached: true });
      }
      const resolved = tCtx.codeSnippets.length ? resolveAiKey() : null;
      if (!resolved || !tCtx.codeSnippets.length) {
        const enrichedFallback = { ...fallback3E };
        if (locale === "vi") {
          enrichedFallback.explainSimple = `Mô hình đại diện cho "${tCtx.title}" dưới dạng ${tCtx.type}. Vai trò nghiệp vụ và hành vi thực thi runtime chưa thể xác định chỉ dựa trên tên gọi hay số lượng kết nối.`;
          enrichedFallback.exploreSimple = `Chưa có đoạn mã nguồn nào được lưu cho phần tử này. Bản xem trước metadata là dữ liệu tái tạo từ AST, không phải bằng chứng mã nguồn.`;
          enrichedFallback.evaluateSimple = "Tính đúng đắn, chất lượng kiến trúc và độ an toàn vận hành không thể khẳng định chỉ từ ngữ cảnh cục bộ này.";
        }
        return NextResponse.json({
          threeEEnrichment: {
            ...enrichedFallback,
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
      const threeESystemPrompt =
        locale === "vi"
          ? THREE_E_SYSTEM_PROMPT +
            `\n\nIMPORTANT LANGUAGE INSTRUCTION: Return all explanation text (explainSimple, exploreSimple, evaluateSimple, snippetNotes, assumptions, unknowns, answer) in clear, natural Vietnamese Software Engineering terminology, while keeping class names, method names, service names, and file paths unchanged.`
          : THREE_E_SYSTEM_PROMPT;
      const parsed3E = await callStructuredLlm<ThreeEAiSimplifiedExplanation>(
        resolved,
        userId,
        threeESystemPrompt,
        userPayload,
      );
      const merged3E: ThreeEAiSimplifiedExplanation = {
        ...normalizeThreeE(parsed3E, tCtx),
        tokenStats: {
          rawChars: tCtx.rawChars,
          compressedChars: tCtx.compressedChars,
          savedPercent: tCtx.savedPercent,
          provider: parsed3E ? resolved.provider : "ast-skeleton",
        },
      };
      if (locale === "vi" && !parsed3E) {
        merged3E.explainSimple = `Mô hình đại diện cho "${tCtx.title}" dưới dạng ${tCtx.type}. Vai trò nghiệp vụ và hành vi thực thi runtime chưa thể xác định chỉ dựa trên tên gọi hay số lượng kết nối.`;
        merged3E.exploreSimple = `Phân tích dựa trên ${tCtx.codeSnippets.length} đoạn mã nguồn đã chọn; bằng chứng là một phần và hành vi runtime chưa được xác minh.`;
        merged3E.evaluateSimple = "Tính đúng đắn, chất lượng kiến trúc và độ an toàn vận hành không thể khẳng định chỉ từ ngữ cảnh cục bộ này.";
      }
      if (threeEEnrichmentCache.size >= 500) {
        const oldest = threeEEnrichmentCache.keys().next().value;
        if (oldest) threeEEnrichmentCache.delete(oldest);
      }
      threeEEnrichmentCache.set(cacheKey, merged3E);
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
        userId,
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
      const resolved = c4Ctx.astSkeleton.trim() ? resolveAiKey() : null;
      if (!resolved || !c4Ctx.astSkeleton.trim()) {
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
        userId,
        C4_SYSTEM_PROMPT,
        userPayload,
      );
      const mergedC4: C4AiDiagramEnrichment = {
        ...normalizeC4(parsedC4, c4Ctx),
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
        userId,
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
