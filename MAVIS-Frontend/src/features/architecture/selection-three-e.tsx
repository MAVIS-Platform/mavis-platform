"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { api as backend } from "@/lib/mainflow-api";
import { Button } from "@/components/ui/button";
import { ThreeEEvidence } from "./three-e-evidence";
import {
  selectionSummary,
  findingRelated,
  RULE_SET,
  ruleNames,
  resultNames,
} from "./three-e-content";

const explanationSchema = z.object({
  modelVersionId: z.string(),
  elementId: z.string().nullish(),
  relationshipId: z.string().nullish(),
  findingId: z.string().nullish(),
  evaluationRunId: z.string().nullish(),
  contractVersion: z.string().nullish(),
  ruleSetVersion: z.string().nullish(),
  explanationText: z.string(),
  providerMode: z.string(),
  cached: z.boolean().nullish(),
  structuredContent: z
    .object({
      summary: z.string(),
      whyItMatters: z.string(),
      unknowns: z.array(z.string()),
      nextSteps: z.array(z.string()),
      evidenceSufficiency: z.string(),
      evidenceRefs: z.array(z.string()),
    })
    .nullish(),
  citedEvidences: z
    .array(
      z.object({
        id: z.string(),
        sourceType: z.string(),
        locator: z.string().nullish(),
        excerpt: z.string().nullish(),
      }),
    )
    .optional(),
});
export function SelectionThreeE({
  model,
  selectedId,
  onSelect,
  onClose,
  onHighlight,
}: {
  model: ArchitecturalModel;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onHighlight?: (ids: string[]) => void;
}) {
  const api = useApi();
  const [tab, setTab] = useState<"explain" | "explore" | "evaluate">("explain"),
    [findingId, setFindingId] = useState(""),
    [limit, setLimit] = useState(6);
  const subject = selectionSummary(model, selectedId),
    { node, edge } = subject;
  const evidence = useApiQuery(
    node ? "elementEvidence" : "relationshipEvidence",
    node
      ? { modelId: model.id, elementId: selectedId }
      : { modelId: model.id, relationshipId: selectedId },
    { enabled: api.mode === "backend" && tab === "explore" && !findingId },
  );
  const runs = useApiQuery(
    "evaluations",
    { modelId: model.id },
    { enabled: api.mode === "backend" && tab !== "explore" },
  );
  const evaluate = useMutation({
    mutationFn: () => api.execute("evaluateModel", { modelId: model.id }),
    onSuccess: () => {
      setFindingId("");
      void runs.refetch();
    },
  });
  const ordered = [...(runs.data ?? [])].sort((a, b) =>
    String(b.result?.["createdAt"] ?? "").localeCompare(String(a.result?.["createdAt"] ?? "")),
  );
  const run = evaluate.data ?? ordered[0],
    runId = run?.id ?? "",
    version = String(run?.result?.["ruleSetVersion"] ?? "");
  const findings = useApiQuery(
    "evaluationFindings",
    { modelId: model.id, evaluationId: runId },
    { enabled: api.mode === "backend" && !!runId && tab !== "explore" },
  );
  const findingEvidence = useApiQuery(
    "findingEvidence",
    { modelId: model.id, evaluationId: runId, findingId },
    { enabled: api.mode === "backend" && !!runId && !!findingId && tab === "explore" },
  );
  const shownEvidence = findingId ? findingEvidence : evidence;
  const matching = (findings.data ?? []).filter((f) => findingRelated(f, selectedId));
  const finding = matching.find((f) => f["id"] === findingId);
  const explain = useMutation({
    mutationFn: async (input: { finding?: Record<string, unknown>; refresh?: boolean }) => {
      const f = input.finding;
      const raw = await backend<unknown>("analyzer/ai/explain", {
        method: "POST",
        body: JSON.stringify({
          modelVersionId: model.id,
          explanationScope: f ? "RULE_FINDING" : node ? "ELEMENT" : "RELATIONSHIP",
          ...(node ? { elementId: selectedId } : { relationshipId: selectedId }),
          ...(f ? { findingId: f["id"], evaluationRunId: runId } : {}),
          forceRefresh: !!input.refresh,
        }),
      });
      const result = explanationSchema.parse(raw);
      if (
        result.modelVersionId !== model.id ||
        (node ? result.elementId : result.relationshipId) !== selectedId ||
        (f && (result.findingId !== f["id"] || result.evaluationRunId !== runId))
      )
        throw Error("Kết quả không khớp lựa chọn hiện tại. Vui lòng thử lại.");
      return result;
    },
  });
  const result = explain.data;
  const refs: Evidence[] = (result?.citedEvidences ?? []).map((e) => ({
    id: e.id,
    kind: e.sourceType.startsWith("RUNTIME") ? "runtime" : "source",
    sourceType: e.sourceType,
    location: e.locator ?? "",
    snippet: e.excerpt ?? "",
    complete: null,
  }));
  function chooseFinding(f: Record<string, unknown>) {
    setFindingId(String(f["id"]));
    setTab("explain");
    explain.reset();
    explain.mutate({ finding: f });
  }
  function highlightFinding(f: Record<string, unknown>) {
    const d = f["details"] as Record<string, unknown> | null;
    const ids = [
      f["elementId"],
      f["relationshipId"],
      ...(Array.isArray(d?.["relatedElementIds"]) ? d["relatedElementIds"] : []),
      ...(Array.isArray(d?.["relatedRelationshipIds"]) ? d["relatedRelationshipIds"] : []),
    ].filter((id): id is string => typeof id === "string");
    onHighlight?.(ids);
  }
  const backendMode = api.mode === "backend";
  return (
    <aside
      aria-label="3E details"
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[85vh] min-w-0 flex-col rounded-xl border bg-card shadow-lg xl:sticky xl:inset-auto xl:top-20 xl:z-auto xl:max-h-[calc(100vh-6rem)] xl:self-start xl:shadow-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Hiểu kiến trúc · 3E</p>
          <h2 className="mt-1 break-words text-base font-semibold">{subject.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subject.type}</p>
        </div>
        <Button size="sm" variant="ghost" aria-label="Close 3E" onClick={onClose}>
          ×
        </Button>
      </header>
      <div className="shrink-0 border-b p-4">
        <p className="text-sm leading-6">{subject.summary}</p>
      </div>
      <div
        role="tablist"
        aria-label="3E actions"
        className="grid shrink-0 grid-cols-3 gap-1 border-b p-2"
      >
        {[
          ["explain", "Giải thích"],
          ["explore", "Bằng chứng"],
          ["evaluate", "Đánh giá"],
        ].map(([value, label], i) => (
          <button
            key={value}
            id={`three-e-tab-${value}`}
            role="tab"
            type="button"
            aria-controls={`three-e-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            className={`rounded-md px-2 py-2 text-sm ${tab === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setTab(value as typeof tab)}
            onKeyDown={(e) => {
              const keys = ["explain", "explore", "evaluate"] as const;
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const target =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(keys[target]!);
                document.getElementById(`three-e-tab-${keys[target]}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`three-e-panel-${tab}`}
        aria-labelledby={`three-e-tab-${tab}`}
        className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm leading-6"
      >
        {findingId && (
          <div className="rounded-md border p-2 text-xs">
            Đang xem căn cứ/giải thích của nhận xét đã chọn.{" "}
            <button
              className="underline"
              onClick={() => {
                setFindingId("");
                explain.reset();
              }}
            >
              Trở về thông tin đối tượng
            </button>
          </div>
        )}
        {tab === "explore" && (
          <>
            <h3 className="font-semibold">Căn cứ để xác minh</h3>
            <p className="text-muted-foreground">
              Đọc căn cứ để xác minh. Một đoạn source riêng lẻ có thể chưa đủ chứng minh toàn bộ
              quan hệ.
            </p>
            {backendMode && shownEvidence.isPending ? (
              <p role="status">Đang tải bằng chứng…</p>
            ) : shownEvidence.error ? (
              <p role="alert">
                Chưa tải được bằng chứng.{" "}
                <button className="underline" onClick={() => void shownEvidence.refetch()}>
                  Thử lại
                </button>
              </p>
            ) : (
              <ThreeEEvidence
                evidence={
                  backendMode
                    ? (shownEvidence.data ?? [])
                    : (node?.evidence ?? edge?.evidence ?? [])
                }
              />
            )}
          </>
        )}
        {tab === "explain" && (
          <>
            <h3 className="font-semibold">
              {finding
                ? (ruleNames[String(finding["ruleId"])] ?? "Giải thích nhận xét")
                : "Ý nghĩa trong dự án"}
            </h3>
            {!finding && (
              <>
                <p>
                  Lựa chọn này có {subject.connections.length} quan hệ được lưu trong mô hình. Mở
                  Bằng chứng để đối chiếu nguồn; mở Đánh giá để xem điểm cần kiểm tra.
                </p>
                <Button size="sm" variant="outline" onClick={() => setTab("explore")}>
                  Xem căn cứ
                </Button>
              </>
            )}
            {backendMode && !finding && !result && (
              <Button
                className="h-auto whitespace-normal"
                size="sm"
                disabled={explain.isPending}
                onClick={() => explain.mutate({})}
              >
                Giải thích thêm từ bằng chứng
              </Button>
            )}
            {explain.isPending && <p role="status">Đang chuẩn bị giải thích…</p>}
            {explain.error && (
              <p role="alert" className="text-destructive">
                Không lấy được giải thích chi tiết. Thông tin cơ bản và bằng chứng vẫn có thể xem.{" "}
                <button
                  className="underline"
                  onClick={() => explain.mutate({ ...(finding ? { finding } : {}), refresh: true })}
                >
                  Thử lại
                </button>
              </p>
            )}
            {result?.structuredContent ? (
              <div className="space-y-4">
                <p>{result.structuredContent.summary}</p>
                <section>
                  <h4 className="font-semibold">Vì sao cần quan tâm?</h4>
                  <p>{result.structuredContent.whyItMatters}</p>
                </section>
                <section>
                  <h4 className="font-semibold">Điều chưa xác định</h4>
                  <ul className="list-disc space-y-1 pl-5">
                    {result.structuredContent.unknowns.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4 className="font-semibold">Nên làm gì tiếp?</h4>
                  <ol className="list-decimal space-y-1 pl-5">
                    {result.structuredContent.nextSteps.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : (
              result && <p className="whitespace-pre-wrap">{result.explanationText}</p>
            )}
            {result && (
              <>
                <details>
                  <summary className="cursor-pointer text-primary">
                    Căn cứ cho lời giải thích ({refs.length})
                  </summary>
                  <div className="mt-3">
                    <ThreeEEvidence evidence={refs} />
                  </div>
                </details>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Nguồn và phiên bản giải thích</summary>
                  <p>
                    {result.providerMode.includes("DETERMINISTIC")
                      ? "Tổng hợp từ mô hình và quy tắc đã lưu"
                      : result.providerMode === "CACHE"
                        ? "Kết quả đã lưu; xem nguồn sinh trong dữ liệu phiên bản"
                        : "Giải thích từ bộ cung cấp AI hoặc kết quả đã lưu"}{" "}
                    · {result.cached ? "Dùng lại kết quả cùng ngữ cảnh" : "Kết quả mới"} ·{" "}
                    {result.ruleSetVersion ?? "Thiếu phiên bản rule trong kết quả cũ"}
                  </p>
                </details>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={explain.isPending}
                  onClick={() => explain.mutate({ ...(finding ? { finding } : {}), refresh: true })}
                >
                  Tạo lại giải thích
                </Button>
              </>
            )}
          </>
        )}
        {tab === "evaluate" && (
          <>
            <h3 className="font-semibold">Có điểm nào cần kiểm tra?</h3>
            <p className="text-muted-foreground">
              Kiểm tra chạy trên toàn bộ bản kiến trúc {model.revision}; bên dưới chỉ hiện các nhận
              xét gắn với lựa chọn này.
            </p>
            {runs.isPending ? (
              <p role="status">Đang tải lần kiểm tra…</p>
            ) : runs.error ? (
              <p role="alert">
                Chưa tải được lịch sử kiểm tra.{" "}
                <button className="underline" onClick={() => void runs.refetch()}>
                  Thử lại
                </button>
              </p>
            ) : !runId ? (
              <p>Chưa kiểm tra bản kiến trúc này.</p>
            ) : (
              <>
                {version !== RULE_SET && (
                  <p className="rounded-md border border-amber-400 p-3">
                    Kết quả lịch sử dùng bộ rule {version || "chưa xác định"}. Kiểm tra lại để áp
                    dụng cơ chế mới; không diễn giải đây là kết luận hiện tại.
                  </p>
                )}
                {findings.isPending ? (
                  <p role="status">Đang tải nhận xét…</p>
                ) : findings.error ? (
                  <p role="alert">
                    Chưa tải được nhận xét.{" "}
                    <button className="underline" onClick={() => void findings.refetch()}>
                      Thử lại
                    </button>
                  </p>
                ) : matching.length ? (
                  <div className="space-y-3">
                    {matching.slice(0, limit).map((f) => {
                      const d = f["details"] as Record<string, unknown> | null;
                      return (
                        <article key={String(f["id"])} className="space-y-3 rounded-lg border p-3">
                          <h4 className="font-semibold">
                            {ruleNames[String(f["ruleId"])] ?? "Nhận xét kiến trúc"}
                          </h4>
                          <p className="text-xs font-medium">
                            {version !== RULE_SET
                              ? "Nhận xét lịch sử · cần kiểm tra lại"
                              : (resultNames[String(f["status"])] ?? "Chưa xác định kết quả")}
                          </p>
                          <p>
                            {version !== RULE_SET
                              ? "Nội dung được giữ để xem lại; dữ liệu hoặc cách đánh giá có thể khác phiên bản hiện tại."
                              : String(f["message"])}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {d?.["evidenceSufficiency"] === "INCOMPLETE"
                              ? "Căn cứ chưa đầy đủ."
                              : "Kết quả giới hạn trong mô hình đã phân tích."}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              className="h-auto whitespace-normal"
                              size="sm"
                              variant="outline"
                              onClick={() => chooseFinding(f)}
                            >
                              Vì sao có nhận xét này?
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setFindingId(String(f["id"]));
                                setTab("explore");
                              }}
                            >
                              Xem căn cứ
                            </Button>
                            {onHighlight && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => highlightFinding(f)}
                              >
                                Xem trên graph
                              </Button>
                            )}
                          </div>
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Thông tin kiểm tra</summary>
                            <p>
                              {String(f["ruleId"])} · {String(f["status"])} ·{" "}
                              {String(f["severity"])} · bộ rule {version}
                            </p>
                            {version !== RULE_SET && <p>{String(f["message"])}</p>}
                          </details>
                        </article>
                      );
                    })}
                    {matching.length > limit && (
                      <Button variant="outline" size="sm" onClick={() => setLimit(limit + 6)}>
                        Xem thêm nhận xét
                      </Button>
                    )}
                  </div>
                ) : (
                  <p>
                    Không có nhận xét gắn trực tiếp với lựa chọn này trong lần kiểm tra đang xem.
                    Điều đó chưa chứng minh đối tượng đã đạt mọi quy tắc.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Bộ rule: {version || "chưa xác định"}
                  {run?.result?.["createdAt"]
                    ? ` · ${new Date(String(run.result["createdAt"])).toLocaleString("vi-VN")}`
                    : ""}
                </p>
              </>
            )}
            <Button
              disabled={!backendMode || evaluate.isPending}
              className="h-auto whitespace-normal"
              onClick={() => {
                explain.reset();
                evaluate.mutate();
              }}
            >
              {evaluate.isPending ? "Đang kiểm tra toàn bộ mô hình…" : "Kiểm tra kiến trúc"}
            </Button>
            {evaluate.error && (
              <p role="alert" className="text-destructive">
                Không chạy được kiểm tra. Kết quả cũ vẫn được giữ. Vui lòng thử lại.
              </p>
            )}
          </>
        )}
        <details>
          <summary className="cursor-pointer text-primary">
            Các quan hệ liên quan ({subject.connections.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {subject.connections.slice(0, 20).map((e) => (
              <li key={e.id}>
                <button
                  className="break-words text-left text-sm underline"
                  onClick={() => onSelect(e.id)}
                >
                  {model.elements.find((n) => n.id === e.from)?.name} →{" "}
                  {model.elements.find((n) => n.id === e.to)?.name}
                </button>
              </li>
            ))}
          </ul>
          {subject.connections.length > 20 && (
            <p className="text-xs">Hiện 20 quan hệ đầu; xem toàn bộ trên graph.</p>
          )}
        </details>
      </div>
      <footer className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
        Bản kiến trúc {model.revision} ·{" "}
        <span title="Explore evidence; Explain finding; Evaluate theo rule">
          3E: Bằng chứng · Giải thích · Đánh giá
        </span>
      </footer>
    </aside>
  );
}
